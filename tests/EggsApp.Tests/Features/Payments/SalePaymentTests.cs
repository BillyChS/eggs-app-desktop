using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace EggsApp.Tests.Features.Payments;

/// <summary>
/// Abonos from a credit sale's Abonar button (Payment.ForSaleId): they pay that sale first, and its window lists every
/// abono that paid it. A new factory per test, so every total is known.
/// </summary>
public sealed class SalePaymentTests : IDisposable
{
    private const string Nov1 = "2024-11-01";
    private const string Nov3 = "2024-11-03";

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public SalePaymentTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    /// <summary>One line of type A at ₡1.000 a carton, so the total is the quantity times 1.000.</summary>
    private static SaleCommand Credit(string date, long thousands, Guid customer, long? paidNow = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], true, customer, paidNow);

    private async Task<Guid> CustomerAsync(string name)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CustomerDetail>())!.Id;
    }

    private async Task<SaleDetail> SaleAsync(SaleCommand command)
    {
        var response = await _client.PostAsJsonAsync("/api/sales", command);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private Task<HttpResponseMessage> PostAbonarAsync(Guid saleId, long? amount) =>
        _client.PostAsJsonAsync($"/api/sales/{saleId}/payments", new SalePaymentCommand(amount));

    private async Task<PaymentDetail> AbonarAsync(Guid saleId, long amount)
    {
        var response = await PostAbonarAsync(saleId, amount);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PaymentDetail>())!;
    }

    private async Task<PaymentDetail> AbonoAsync(Guid customer, string date, long amount)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/customers/{customer}/payments",
            new PaymentCommand(date, amount, null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PaymentDetail>())!;
    }

    private async Task<SalePaymentsResponse> HistoryAsync(Guid saleId) =>
        (await _client.GetFromJsonAsync<SalePaymentsResponse>($"/api/sales/{saleId}/payments"))!;

    private async Task<long> OwedAsync(Guid saleId) =>
        (await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{saleId}"))!.Owed;

    private async Task<long> BalanceAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerDetail>($"/api/customers/{customerId}"))!.Balance;

    private static async Task<string> ReadAmountErrorAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return Assert.Single((await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors["amount"]);
    }

    private static async Task<string> ReadRefusalAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Refusal>())!.Message;
    }

    [Fact]
    public async Task Abonar_PaysThatSale_EvenWhenAnOlderOneStillOwes()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await SaleAsync(Credit(Nov1, 5, luis));
        var newer = await SaleAsync(Credit(Nov3, 3, luis));

        var abono = await AbonarAsync(newer.Id, 2000);

        Assert.Equal(newer.Id, abono.ForSaleId);
        Assert.Equal(DateOnly.FromDateTime(DateTime.Now), abono.Date);
        Assert.Equal(5000, await OwedAsync(older.Id));
        Assert.Equal(1000, await OwedAsync(newer.Id));
        Assert.Equal(6000, await BalanceAsync(luis));
    }

    [Fact]
    public async Task Abonar_PayingAllItOwes_MarksTheSalePaid()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await SaleAsync(Credit(Nov1, 3, luis, paidNow: 1000));

        await AbonarAsync(sale.Id, 2000);

        Assert.Equal(0, await OwedAsync(sale.Id));
        Assert.Equal(CreateSalePayment.PaidOffMessage, await ReadAmountErrorAsync(await PostAbonarAsync(sale.Id, 1)));
    }

    [Fact]
    public async Task Abonar_MoreThanTheSaleOwes_IsRefused_EvenIfTheCustomerOwesMore()
    {
        var luis = await CustomerAsync("Don Luis");
        await SaleAsync(Credit(Nov1, 5, luis));
        var sale = await SaleAsync(Credit(Nov3, 3, luis, paidNow: 2500));

        var tooMuch = await PostAbonarAsync(sale.Id, 501);

        Assert.Equal("El abono no puede ser mayor a lo que debe (₡500).", await ReadAmountErrorAsync(tooMuch));
        Assert.Equal(5500, await BalanceAsync(luis));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0L)]
    [InlineData(-5L)]
    public async Task Abonar_WithoutAPositiveAmount_AsksForOne(long? amount)
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await SaleAsync(Credit(Nov1, 3, luis));

        Assert.Equal("Escriba cuánto va a abonar.", await ReadAmountErrorAsync(await PostAbonarAsync(sale.Id, amount)));
    }

    [Fact]
    public async Task Abonar_ACashSale_IsRefused_AndAMissingSaleIsNotFound()
    {
        var cash = await SaleAsync(new SaleCommand(Nov1, [new SaleItemCommand("A", 1, 1000)]));

        Assert.Equal(CreateSalePayment.CashSaleMessage, await ReadRefusalAsync(await PostAbonarAsync(cash.Id, 100)));
        Assert.Equal(HttpStatusCode.NotFound, (await PostAbonarAsync(Guid.NewGuid(), 100)).StatusCode);
    }

    [Fact]
    public async Task Abonar_ADeletedCustomersSale_IsRefused()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await SaleAsync(Credit(Nov1, 1, luis));
        await AbonarAsync(sale.Id, 1000);
        (await _client.DeleteAsync($"/api/customers/{luis}")).EnsureSuccessStatusCode();

        Assert.Contains("se borró", await ReadRefusalAsync(await PostAbonarAsync(sale.Id, 1)));
    }

    [Fact]
    public async Task History_ListsEveryAbonoThatPaidTheSale_NewestFirst_WithPartsOfLargerOnes()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await SaleAsync(Credit(Nov1, 2, luis, paidNow: 500));
        var newer = await SaleAsync(Credit(Nov3, 4, luis));

        // ₡2.000 to the customer: ₡1.500 finishes the older sale and ₡500 goes on to the newer one.
        var plain = await AbonoAsync(luis, Nov3, 2000);
        var fromButton = await AbonarAsync(newer.Id, 1000);

        var history = await HistoryAsync(newer.Id);
        Assert.Equal(newer.Id, history.Sale.Id);
        Assert.Equal(1500, history.Paid);
        Assert.Equal(2500, history.Sale.Owed);
        Assert.Equal(
            [
                new SalePaymentShare(fromButton.Id, fromButton.Date, 1000, 1000, false),
                new SalePaymentShare(plain.Id, plain.Date, 500, 2000, false),
            ],
            history.Payments);

        var olderHistory = await HistoryAsync(older.Id);
        Assert.Equal(0, olderHistory.Sale.Owed);
        Assert.Equal(2000, olderHistory.Paid);
        Assert.Equal([1500, 500], olderHistory.Payments.Select(share => share.Applied));
        Assert.True(olderHistory.Payments[1].PaidWithSale);
    }

    [Fact]
    public async Task History_OfACashSale_IsEmpty_AndOfAMissingSaleIsNotFound()
    {
        var cash = await SaleAsync(new SaleCommand(Nov1, [new SaleItemCommand("A", 1, 1000)]));

        var history = await HistoryAsync(cash.Id);

        Assert.Empty(history.Payments);
        Assert.Equal(0, history.Paid);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/sales/{Guid.NewGuid()}/payments")).StatusCode);
    }

    [Fact]
    public async Task DeletingASale_WithAbonosFromItsAbonarButton_SendsThemToTheOtherFiados()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await SaleAsync(Credit(Nov1, 5, luis));
        var newer = await SaleAsync(Credit(Nov3, 3, luis));
        var abono = await AbonarAsync(newer.Id, 2000);

        var deleted = await _client.DeleteAsync($"/api/sales/{newer.Id}");

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(3000, await OwedAsync(older.Id));
        Assert.Equal(3000, await BalanceAsync(luis));

        // The money still came in: the abono stays, as a plain abono of the customer.
        var today = DateOnly.FromDateTime(DateTime.Now).ToString("yyyy-MM-dd");
        var listed = (await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?from={today}&to={today}"))!;
        var kept = Assert.Single(listed.Payments);
        Assert.Equal(abono.Id, kept.Id);
        Assert.Null(kept.ForSaleDate);
    }

    [Fact]
    public async Task DeletingASale_WithAbonosFromItsAbonarButton_IsRefused_WhenNothingElseIsOwed()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await SaleAsync(Credit(Nov1, 3, luis));
        await AbonarAsync(sale.Id, 2000);

        var refused = await _client.DeleteAsync($"/api/sales/{sale.Id}");

        Assert.Contains("ya abonó ₡2.000", await ReadRefusalAsync(refused));
        Assert.Equal(1000, await OwedAsync(sale.Id));
    }

    [Fact]
    public async Task LoweringASale_BelowItsAbonos_SendsWhatsLeftToTheOtherFiados()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await SaleAsync(Credit(Nov1, 5, luis));
        var newer = await SaleAsync(Credit(Nov3, 3, luis));
        var abono = await AbonarAsync(newer.Id, 3000);

        var edited = await _client.PutAsJsonAsync($"/api/sales/{newer.Id}", Credit(Nov3, 1, luis));
        edited.EnsureSuccessStatusCode();

        Assert.Equal(0, await OwedAsync(newer.Id));
        Assert.Equal(3000, await OwedAsync(older.Id));
        Assert.Equal([new SalePaymentShare(abono.Id, abono.Date, 1000, 3000, false)], (await HistoryAsync(newer.Id)).Payments);
    }

    [Fact]
    public async Task MovingASale_ToSomeoneElse_LeavesItsAbonosWithWhoPaidThem()
    {
        var luis = await CustomerAsync("Don Luis");
        var maria = await CustomerAsync("María");
        var his = await SaleAsync(Credit(Nov1, 5, luis));
        var moved = await SaleAsync(Credit(Nov3, 3, luis));
        await AbonarAsync(moved.Id, 2000);

        var edited = await _client.PutAsJsonAsync($"/api/sales/{moved.Id}", Credit(Nov3, 3, maria));
        edited.EnsureSuccessStatusCode();

        Assert.Equal(3000, await OwedAsync(moved.Id));
        Assert.Equal(3000, await OwedAsync(his.Id));
        Assert.Equal(3000, await BalanceAsync(luis));
        Assert.Equal(3000, await BalanceAsync(maria));
    }

    [Fact]
    public async Task AnAbonoFromTheAbonarButton_CanBeEditedAndDeletedLikeAnyOther()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await SaleAsync(Credit(Nov1, 3, luis));
        var abono = await AbonarAsync(sale.Id, 1000);

        var edited = await _client.PutAsJsonAsync($"/api/payments/{abono.Id}", new PaymentCommand(Nov3, 1500, "Corregido"));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal(1500, await OwedAsync(sale.Id));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/payments/{abono.Id}")).StatusCode);
        Assert.Equal(3000, await OwedAsync(sale.Id));
    }

    // A backup is a copy of the SQLite file (SqliteBackup.CopyDatabase, as the daily backup makes it), so ForSaleId is
    // in it like every other column. Restoring is putting a copy of it in place of eggs.db.
    [Fact]
    public async Task BackupAndRestore_KeepsAbonosFromAbonar_SoEverySaleOwesTheSameWithTheSameHistory()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await SaleAsync(Credit(Nov1, 3, luis, paidNow: 500));
        var newer = await SaleAsync(Credit(Nov3, 4, luis));
        var fromButton = await AbonarAsync(newer.Id, 1000);
        // ₡3.000 to the customer: ₡2.500 finishes the older sale and ₡500 goes to the newer one, as a partial share.
        await AbonoAsync(luis, Nov3, 3000);

        Guid[] sales = [older.Id, newer.Id];
        var urls = sales.SelectMany(id => new[] { $"/api/sales/{id}", $"/api/sales/{id}/payments" }).ToList();
        urls.Add($"/api/customers/{luis}");
        var before = await Task.WhenAll(urls.Select(url => _client.GetStringAsync(url)));
        var owed = await Task.WhenAll(sales.Select(OwedAsync));
        Assert.Equal([0, 2500], owed);
        Assert.Contains((await HistoryAsync(newer.Id)).Payments, share => share is { Applied: 500, Amount: 3000 });

        var backup = Path.Combine(Path.GetDirectoryName(_factory.DatabasePath)!, "backup.db");
        SqliteBackup.CopyDatabase(_factory.DatabasePath, backup);

        using var restored = new EggsAppFactory();
        File.Copy(backup, restored.DatabasePath);
        using var client = restored.CreateClient();

        Assert.Equal(before, await Task.WhenAll(urls.Select(url => client.GetStringAsync(url))));
        using var connection = restored.ConnectToDatabase();
        Assert.Equal(
            newer.Id.ToString(),
            TestDatabaseFolder.Scalar(connection, $"SELECT lower(ForSaleId) FROM Payments WHERE lower(Id) = '{fromButton.Id}'"));
    }
}
