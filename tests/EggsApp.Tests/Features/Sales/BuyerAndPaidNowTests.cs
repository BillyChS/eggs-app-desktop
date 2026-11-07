using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace EggsApp.Tests.Features.Sales;

/// <summary>
/// Who bought a cash sale, which never touches a balance, and what was paid as a credit sale was made, which is an
/// abono tied to that sale. A new factory per test, so every total is known.
/// </summary>
public sealed class BuyerAndPaidNowTests : IDisposable
{
    private const string Nov3 = "2024-11-03";
    private const string Nov4 = "2024-11-04";

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public BuyerAndPaidNowTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    /// <summary>One line of type A at ₡1.000 a carton, so the total is the quantity times 1.000.</summary>
    private static SaleCommand Cash(string date, long thousands, Guid? buyer = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], false, buyer);

    private static SaleCommand Credit(string date, long thousands, Guid customer, long? paidNow = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], true, customer, paidNow);

    private async Task<Guid> CustomerAsync(string name)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CustomerDetail>())!.Id;
    }

    private async Task<SaleDetail> CreateAsync(SaleCommand command)
    {
        var response = await _client.PostAsJsonAsync("/api/sales", command);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private async Task<SaleDetail> UpdateAsync(Guid id, SaleCommand command)
    {
        var response = await _client.PutAsJsonAsync($"/api/sales/{id}", command);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private async Task<long> BalanceAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerDetail>($"/api/customers/{customerId}"))!.Balance;

    private async Task<CustomerStatement> StatementAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerStatement>($"/api/customers/{customerId}/statement"))!;

    private async Task<IReadOnlyList<PaymentDetail>> AbonosAsync(string from = Nov3, string to = Nov4) =>
        (await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?from={from}&to={to}"))!.Payments;

    private static async Task<IDictionary<string, string[]>> ReadErrorsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors;
    }

    private static async Task<string> ReadRefusalAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Refusal>())!.Message;
    }

    // ── Who bought a cash sale ──────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CashSale_WithOrWithoutABuyer_IsSaved_AndShowsTheName()
    {
        var rosa = await CustomerAsync("Doña Rosa");

        var named = await CreateAsync(Cash(Nov3, 3, rosa));
        var anonymous = await CreateAsync(Cash(Nov3, 2));

        Assert.False(named.IsCredit);
        Assert.Equal(new CustomerRef(rosa, "Doña Rosa", false), named.Customer);
        Assert.Null(anonymous.Customer);

        var list = (await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}"))!;
        Assert.Equal("Doña Rosa", list.Sales.Single(sale => sale.Id == named.Id).Customer!.Name);
        Assert.Equal(5000, list.CashTotal);
        Assert.Equal(0, list.CreditTotal);
    }

    [Fact]
    public async Task CashSale_WithABuyer_NeverTouchesTheBalance()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        await CreateAsync(Credit(Nov3, 5, rosa));
        var cash = await CreateAsync(Cash(Nov3, 3, rosa));

        Assert.Equal(5000, await BalanceAsync(rosa));

        await UpdateAsync(cash.Id, Cash(Nov4, 7, rosa));
        Assert.Equal(5000, await BalanceAsync(rosa));

        var owed = (await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers"))!.OwedTotal;
        Assert.Equal(5000, owed);

        var deleted = await _client.DeleteAsync($"/api/sales/{cash.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(5000, await BalanceAsync(rosa));
    }

    [Fact]
    public async Task Statement_KeepsCashPurchasesApartFromTheAccount()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var credit = await CreateAsync(Credit(Nov3, 5, rosa));
        var older = await CreateAsync(Cash(Nov3, 3, rosa));
        var newer = await CreateAsync(Cash(Nov4, 2, rosa));
        await CreateAsync(Cash(Nov4, 9));

        var statement = await StatementAsync(rosa);

        Assert.Equal(5000, statement.Balance);
        Assert.Equal(credit.Id, Assert.Single(statement.Entries).Id);
        Assert.Equal([newer.Id, older.Id], statement.CashPurchases.Select(purchase => purchase.Id));
        Assert.Equal([2000L, 3000L], statement.CashPurchases.Select(purchase => purchase.Total));
        Assert.Equal("A", statement.CashPurchases[0].Items.Single().CartonType);
    }

    [Fact]
    public async Task CashSale_ToSomeoneWhoDoesNotExist_IsRefused()
    {
        var response = await _client.PostAsJsonAsync("/api/sales", Cash(Nov3, 1, Guid.NewGuid()));

        Assert.Equal(["Ese cliente ya no existe. Escoja otro."], (await ReadErrorsAsync(response))["customerId"]);
    }

    [Fact]
    public async Task ACustomerWithOnlyCashPurchases_CanBeDeleted_AndTheSaleStaysEditable()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var cash = await CreateAsync(Cash(Nov3, 3, rosa));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/customers/{rosa}")).StatusCode);

        var read = (await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{cash.Id}"))!;
        Assert.Equal(new CustomerRef(rosa, "Doña Rosa", true), read.Customer);

        // It moves no balance, so it can still be corrected, keeping her name.
        var edited = await UpdateAsync(cash.Id, Cash(Nov4, 4, rosa));
        Assert.Equal(4000, edited.Total);
        Assert.True(edited.Customer!.IsDeleted);

        // But nothing new goes to her, not even this sale as a fiado.
        var toCredit = await _client.PutAsJsonAsync($"/api/sales/{cash.Id}", Credit(Nov4, 4, rosa));
        Assert.Equal(["Ese cliente ya no existe. Escoja otro."], (await ReadErrorsAsync(toCredit))["customerId"]);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/sales/{cash.Id}")).StatusCode);
    }

    [Fact]
    public async Task ACashSale_CanMoveToAnotherBuyerOrToNobody()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var luis = await CustomerAsync("Don Luis");
        var cash = await CreateAsync(Cash(Nov3, 3, rosa));

        Assert.Equal(luis, (await UpdateAsync(cash.Id, Cash(Nov3, 3, luis))).Customer!.Id);
        Assert.Null((await UpdateAsync(cash.Id, Cash(Nov3, 3))).Customer);
    }

    // ── Paid when a credit sale was made ────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PaidNow_SavesTheFiadoAndAnAbonoTiedToIt_OnTheSameDay()
    {
        var rosa = await CustomerAsync("Doña Rosa");

        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));

        Assert.Equal(10000, sale.Total);
        Assert.Equal(4000, sale.PaidNow);
        Assert.Equal(6000, await BalanceAsync(rosa));

        var abono = Assert.Single(await AbonosAsync());
        Assert.Equal((rosa, new DateOnly(2024, 11, 3), 4000L, sale.Id), (abono.Customer.Id, abono.Date, abono.Amount, abono.SaleId));

        var statement = await StatementAsync(rosa);
        Assert.Equal(sale.Id, statement.Entries.Single(entry => entry.Kind == GetStatement.PaymentKind).SaleId);
        Assert.Equal(4000, (await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{sale.Id}"))!.PaidNow);

        // Cash-basis: what was paid came in that day; the fiado itself didn't.
        var day = (await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}"))!;
        Assert.Equal((0L, 10000L), (day.CashTotal, day.CreditTotal));
        Assert.Equal(4000, day.Sales.Single().PaidNow);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(null)]
    public async Task PaidNow_ZeroOrMissing_MeansNoAbono(long? paidNow)
    {
        var rosa = await CustomerAsync("Doña Rosa");

        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow));

        Assert.Equal(0, sale.PaidNow);
        Assert.Empty(await AbonosAsync());
        Assert.Equal(10000, await BalanceAsync(rosa));
    }

    [Fact]
    public async Task PaidNow_IsCheckedAgainstTheTotal()
    {
        var rosa = await CustomerAsync("Doña Rosa");

        async Task<string> ErrorFor(SaleCommand command) =>
            Assert.Single((await ReadErrorsAsync(await _client.PostAsJsonAsync("/api/sales", command)))[SaleValidator.PaidNowField]);

        Assert.Equal("No puede ser mayor que el total de la venta (₡10.000).", await ErrorFor(Credit(Nov3, 10, rosa, 10001)));
        Assert.Equal(SaleValidator.PaidInFullMessage, await ErrorFor(Credit(Nov3, 10, rosa, 10000)));
        Assert.Equal("Escriba cuánto pagó, o déjelo vacío.", await ErrorFor(Credit(Nov3, 10, rosa, -1)));
        Assert.Equal(
            "Solo una venta fiada lleva un pago aparte.",
            await ErrorFor(Cash(Nov3, 10, rosa) with { PaidNow = 100 }));

        Assert.Empty((await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}"))!.Sales);
        Assert.Empty(await AbonosAsync());
    }

    [Fact]
    public async Task PaidNow_IsAllOrNothing_WithItsSale()
    {
        var rosa = await CustomerAsync("Doña Rosa");

        using var failing = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureDbContext<AppDbContext>(options => options.AddInterceptors(new FailAbonoInsert()))));
        using var client = failing.CreateClient();

        var response = await client.PostAsJsonAsync("/api/sales", Credit(Nov3, 10, rosa, paidNow: 4000));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Empty((await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}"))!.Sales);
        Assert.Empty(await AbonosAsync());
        Assert.Equal(0, await BalanceAsync(rosa));

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(0L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM Sales"));
        Assert.Equal(0L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM SaleItems"));
    }

    /// <summary>Fails the abono's INSERT, after the sale and its lines were already written in the same transaction.</summary>
    private sealed class FailAbonoInsert : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default) =>
            command.CommandText.Contains("INSERT INTO \"Payments\"", StringComparison.Ordinal)
                ? throw new InvalidOperationException("Simulated failure while saving the abono.")
                : base.ReaderExecutingAsync(command, eventData, result, cancellationToken);

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default) =>
            command.CommandText.Contains("INSERT INTO \"Payments\"", StringComparison.Ordinal)
                ? throw new InvalidOperationException("Simulated failure while saving the abono.")
                : base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    [Fact]
    public async Task EditingTheSale_ChangesItsAbono_ToFollowTheDateAndAmount()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));
        var abonoId = Assert.Single(await AbonosAsync()).Id;

        var edited = await UpdateAsync(sale.Id, Credit(Nov4, 12, rosa, paidNow: 5000));

        Assert.Equal(5000, edited.PaidNow);
        var abono = Assert.Single(await AbonosAsync());
        Assert.Equal((abonoId, new DateOnly(2024, 11, 4), 5000L), (abono.Id, abono.Date, abono.Amount));
        Assert.Equal(7000, await BalanceAsync(rosa));
    }

    [Fact]
    public async Task EditingTheSale_WithoutPaidNow_DeletesItsAbono()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));

        var edited = await UpdateAsync(sale.Id, Credit(Nov3, 10, rosa));

        Assert.Equal(0, edited.PaidNow);
        Assert.Empty(await AbonosAsync());
        Assert.Equal(10000, await BalanceAsync(rosa));
    }

    [Fact]
    public async Task EditingTheSale_IntoACashSale_DeletesItsAbono_AndKeepsTheBuyer()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));

        var edited = await UpdateAsync(sale.Id, Cash(Nov3, 10, rosa));

        Assert.False(edited.IsCredit);
        Assert.Equal(rosa, edited.Customer!.Id);
        Assert.Empty(await AbonosAsync());
        Assert.Equal(0, await BalanceAsync(rosa));
    }

    [Fact]
    public async Task MovingTheSale_ToAnotherCustomer_MovesItsAbonoToo()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var luis = await CustomerAsync("Don Luis");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));

        await UpdateAsync(sale.Id, Credit(Nov3, 10, luis, paidNow: 4000));

        var abono = Assert.Single(await AbonosAsync());
        Assert.Equal((luis, sale.Id), (abono.Customer.Id, abono.SaleId));
        Assert.Equal(0, await BalanceAsync(rosa));
        Assert.Equal(6000, await BalanceAsync(luis));
    }

    [Fact]
    public async Task EditingTheSale_CountsItsAbono_WhenCheckingTheBalanceStaysAboveZero()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));
        var other = await _client.PostAsJsonAsync($"/api/customers/{rosa}/payments", new PaymentCommand(Nov3, 5000, null));
        Assert.Equal(HttpStatusCode.Created, other.StatusCode);

        // 9.000 paid in all: a sale of 8.000 with 3.000 paid now would leave 8.000 owed against 8.000 paid. Fine.
        await UpdateAsync(sale.Id, Credit(Nov3, 8, rosa, paidNow: 3000));
        Assert.Equal(0, await BalanceAsync(rosa));

        // A sale of 7.000, still with 3.000 paid now, would leave 7.000 owed against 8.000 paid.
        var refused = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Credit(Nov3, 7, rosa, paidNow: 3000));
        Assert.Contains("ya abonó ₡8.000", await ReadRefusalAsync(refused));
    }

    [Fact]
    public async Task DeletingTheSale_DeletesItsAbonoToo()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/sales/{sale.Id}")).StatusCode);

        Assert.Empty(await AbonosAsync());
        Assert.Equal(0, await BalanceAsync(rosa));
        Assert.Empty((await StatementAsync(rosa)).Entries);
    }

    [Fact]
    public async Task DeletingTheSale_IsStillRefused_WhenOtherAbonosWouldBeMoreThanWhatIsLeft()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        var sale = await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 1000));
        await CreateAsync(Credit(Nov3, 2, rosa));
        var other = await _client.PostAsJsonAsync($"/api/customers/{rosa}/payments", new PaymentCommand(Nov3, 4000, null));
        Assert.Equal(HttpStatusCode.Created, other.StatusCode);

        var refused = await _client.DeleteAsync($"/api/sales/{sale.Id}");

        Assert.Equal(
            "Doña Rosa ya abonó ₡4.000, y sin esta venta sus fiados sumarían ₡2.000. Primero corrija o borre un abono de Doña Rosa.",
            await ReadRefusalAsync(refused));
        Assert.Equal(2, (await AbonosAsync()).Count);
    }

    [Fact]
    public async Task TheAbonoTiedToASale_ChangesOnlyFromThatSale()
    {
        var rosa = await CustomerAsync("Doña Rosa");
        await CreateAsync(Credit(Nov3, 10, rosa, paidNow: 4000));
        var abono = Assert.Single(await AbonosAsync());

        var edit = await _client.PutAsJsonAsync($"/api/payments/{abono.Id}", new PaymentCommand(Nov3, 1000, null));
        var delete = await _client.DeleteAsync($"/api/payments/{abono.Id}");

        const string Message =
            "Este abono se dio al hacer una venta fiada, así que se cambia o se borra desde esa venta.";
        Assert.Equal(Message, await ReadRefusalAsync(edit));
        Assert.Equal(Message, await ReadRefusalAsync(delete));
        Assert.Equal(4000, Assert.Single(await AbonosAsync()).Amount);
    }
}
