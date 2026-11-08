using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace EggsApp.Tests.Features.Sales;

/// <summary>
/// What each credit sale still owes ("Debe ₡X" or "Pagado con abonos"): a sale's own abono first, then every other
/// abono to the oldest sales first. And customers added together with a sale. A new factory per test.
/// </summary>
public sealed class SaleStatusTests : IDisposable
{
    private const string Oct28 = "2024-10-28";
    private const string Nov1 = "2024-11-01";
    private const string Nov3 = "2024-11-03";
    private const string Nov4 = "2024-11-04";

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public SaleStatusTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    /// <summary>One line of type A at ₡1.000 a carton, so the total is the quantity times 1.000.</summary>
    private static SaleCommand Credit(string date, long thousands, Guid customer, long? paidNow = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], true, customer, paidNow);

    private static SaleCommand Cash(string date, long thousands, Guid? buyer = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], false, buyer);

    private async Task<Guid> CustomerAsync(string name, string? phone = null)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, phone, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CustomerDetail>())!.Id;
    }

    private async Task<SaleDetail> CreateAsync(SaleCommand command)
    {
        var response = await _client.PostAsJsonAsync("/api/sales", command);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private async Task<PaymentDetail> AbonoAsync(Guid customer, string date, long amount)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/customers/{customer}/payments",
            new PaymentCommand(date, amount, null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PaymentDetail>())!;
    }

    /// <returns>What each sale of the range owes, by id.</returns>
    private async Task<Dictionary<Guid, long>> OwedAsync(string from = Oct28, string to = Nov4) =>
        (await ListAsync(from, to)).Sales.ToDictionary(sale => sale.Id, sale => sale.Owed);

    private async Task<SaleListResponse> ListAsync(string from, string to) =>
        (await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={from}&to={to}"))!;

    private async Task<long> BalanceAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerDetail>($"/api/customers/{customerId}"))!.Balance;

    // ── Sharing out the abonos ──────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Abonos_PayTheOldestSalesFirst_AndWhatsOwedAddsUpToTheBalance()
    {
        var luis = await CustomerAsync("Don Luis");
        var first = await CreateAsync(Credit(Oct28, 5, luis));
        var second = await CreateAsync(Credit(Nov1, 4, luis));
        var third = await CreateAsync(Credit(Nov3, 3, luis));

        // ₡7.000 in two abonos: all of the first sale, and 2.000 of the second.
        await AbonoAsync(luis, Nov3, 3000);
        await AbonoAsync(luis, Nov4, 4000);

        var owed = await OwedAsync();
        Assert.Equal(0, owed[first.Id]);
        Assert.Equal(2000, owed[second.Id]);
        Assert.Equal(3000, owed[third.Id]);
        Assert.Equal(await BalanceAsync(luis), owed.Values.Sum());
    }

    [Fact]
    public async Task Abonos_AreSharedByCustomer_NeverAcrossCustomers()
    {
        var luis = await CustomerAsync("Don Luis");
        var maria = await CustomerAsync("María");
        var his = await CreateAsync(Credit(Nov1, 5, luis));
        var hers = await CreateAsync(Credit(Nov1, 5, maria));

        await AbonoAsync(luis, Nov3, 5000);

        var owed = await OwedAsync();
        Assert.Equal(0, owed[his.Id]);
        Assert.Equal(5000, owed[hers.Id]);
    }

    [Fact]
    public async Task SameDaySales_AreOrderedByWhenTheyWereEntered()
    {
        var luis = await CustomerAsync("Don Luis");
        var morning = await CreateAsync(Credit(Nov3, 2, luis));
        var afternoon = await CreateAsync(Credit(Nov3, 2, luis));
        var evening = await CreateAsync(Credit(Nov3, 2, luis));

        await AbonoAsync(luis, Nov4, 3000);

        var owed = await OwedAsync();
        Assert.Equal(0, owed[morning.Id]);
        Assert.Equal(1000, owed[afternoon.Id]);
        Assert.Equal(2000, owed[evening.Id]);
    }

    [Fact]
    public async Task ASaleTypedInLaterForAnEarlierDay_IsPaidFirst()
    {
        var luis = await CustomerAsync("Don Luis");
        var nov3 = await CreateAsync(Credit(Nov3, 4, luis));
        var oct28 = await CreateAsync(Credit(Oct28, 4, luis));

        await AbonoAsync(luis, Nov4, 4000);

        var owed = await OwedAsync();
        Assert.Equal(0, owed[oct28.Id]);
        Assert.Equal(4000, owed[nov3.Id]);
    }

    [Fact]
    public async Task ALinkedAbono_PaysItsOwnSaleFirst_EvenWhenItsTheNewest()
    {
        var luis = await CustomerAsync("Don Luis");
        var older = await CreateAsync(Credit(Nov1, 5, luis));
        var newer = await CreateAsync(Credit(Nov3, 10, luis, paidNow: 4000));

        var owed = await OwedAsync();
        Assert.Equal(5000, owed[older.Id]);
        Assert.Equal(6000, owed[newer.Id]);

        // A later abono goes to the oldest sale, and what's left of it to the newer one.
        await AbonoAsync(luis, Nov4, 7000);

        owed = await OwedAsync();
        Assert.Equal(0, owed[older.Id]);
        Assert.Equal(4000, owed[newer.Id]);
        Assert.Equal(await BalanceAsync(luis), owed.Values.Sum());
    }

    [Fact]
    public async Task CashSales_OweNothing_WithOrWithoutABuyer()
    {
        var luis = await CustomerAsync("Don Luis");
        var named = await CreateAsync(Cash(Nov3, 3, luis));
        var anonymous = await CreateAsync(Cash(Nov3, 2));
        await CreateAsync(Credit(Nov3, 5, luis));

        var owed = await OwedAsync();
        Assert.Equal(0, owed[named.Id]);
        Assert.Equal(0, owed[anonymous.Id]);
    }

    // ── Changes move the statuses ───────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task DeletingAnOldSale_SendsTheAbonosOnToTheNextOne()
    {
        var luis = await CustomerAsync("Don Luis");
        var first = await CreateAsync(Credit(Oct28, 3, luis));
        var second = await CreateAsync(Credit(Nov1, 5, luis));
        await AbonoAsync(luis, Nov3, 3000);

        Assert.Equal(5000, (await OwedAsync())[second.Id]);

        var deleted = await _client.DeleteAsync($"/api/sales/{first.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.Equal(2000, (await OwedAsync())[second.Id]);
    }

    [Fact]
    public async Task EditingASale_ChangesItsStatusAndTheOnesAfterIt()
    {
        var luis = await CustomerAsync("Don Luis");
        var first = await CreateAsync(Credit(Oct28, 3, luis));
        var second = await CreateAsync(Credit(Nov1, 5, luis));
        await AbonoAsync(luis, Nov3, 4000);

        var owed = await OwedAsync();
        Assert.Equal(0, owed[first.Id]);
        Assert.Equal(4000, owed[second.Id]);

        // The first sale grows to 6.000: the abono now pays only part of it, and none of the second.
        var edit = await _client.PutAsJsonAsync($"/api/sales/{first.Id}", Credit(Oct28, 6, luis));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        owed = await OwedAsync();
        Assert.Equal(2000, owed[first.Id]);
        Assert.Equal(5000, owed[second.Id]);

        // Moved after the second sale, it's paid after it.
        edit = await _client.PutAsJsonAsync($"/api/sales/{first.Id}", Credit(Nov4, 6, luis));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        owed = await OwedAsync();
        Assert.Equal(1000, owed[second.Id]);
        Assert.Equal(6000, owed[first.Id]);
    }

    [Fact]
    public async Task DeletingAnAbono_MakesTheSalesOweAgain()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await CreateAsync(Credit(Nov1, 5, luis));
        var abono = await AbonoAsync(luis, Nov3, 5000);

        Assert.Equal(0, (await OwedAsync())[sale.Id]);

        var deleted = await _client.DeleteAsync($"/api/payments/{abono.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.Equal(5000, (await OwedAsync())[sale.Id]);
    }

    // ── Periods ─────────────────────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task AMonth_ShowsItsOwnSales_WithStatusesFromAllTheirHistory()
    {
        var luis = await CustomerAsync("Don Luis");
        var october = await CreateAsync(Credit(Oct28, 4, luis));
        var november = await CreateAsync(Credit(Nov3, 4, luis));
        await AbonoAsync(luis, Nov4, 5000);

        var month = await ListAsync("2024-11-01", "2024-11-30");

        // October's sale isn't listed, but the abono paid it before reaching November's.
        var only = Assert.Single(month.Sales);
        Assert.Equal(november.Id, only.Id);
        Assert.Equal(3000, only.Owed);
        Assert.Equal(4000, month.CreditTotal);

        var octoberRead = Assert.Single((await ListAsync("2024-10-01", "2024-10-31")).Sales);
        Assert.Equal(october.Id, octoberRead.Id);
        Assert.Equal(0, octoberRead.Owed);
    }

    [Fact]
    public async Task TheList_ShowsTheCustomersPhone()
    {
        var rosa = await CustomerAsync("Doña Rosa", "8812-4455");
        await CreateAsync(Cash(Nov3, 3, rosa));

        var sale = Assert.Single((await ListAsync(Nov3, Nov3)).Sales);
        Assert.Equal("8812-4455", sale.Customer!.Phone);
    }

    [Fact]
    public async Task ADeletedCustomersSales_KeepTheirStatus()
    {
        var luis = await CustomerAsync("Don Luis");
        var sale = await CreateAsync(Credit(Nov1, 5, luis));
        await AbonoAsync(luis, Nov3, 5000);

        var deleted = await _client.DeleteAsync($"/api/customers/{luis}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var read = Assert.Single((await ListAsync(Nov1, Nov1)).Sales);
        Assert.Equal(sale.Id, read.Id);
        Assert.Equal(0, read.Owed);
        Assert.True(read.Customer!.IsDeleted);
    }

    // ── A customer added with the sale ──────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ANewCustomer_IsSavedWithTheSale()
    {
        var command = Credit(Nov3, 5, Guid.Empty, paidNow: 2000) with
        {
            CustomerId = null,
            NewCustomer = new NewCustomerCommand("  Ana   Solano ", " 8888-1234 "),
        };

        var sale = await CreateAsync(command);

        Assert.Equal("Ana Solano", sale.Customer!.Name);
        Assert.Equal("8888-1234", sale.Customer.Phone);
        Assert.Equal(3000, sale.Owed);
        Assert.Equal(3000, await BalanceAsync(sale.Customer.Id));

        var customers = (await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers"))!.Items;
        Assert.Equal("Ana Solano", Assert.Single(customers).Name);
    }

    [Fact]
    public async Task ANewCustomer_CanBuyForCash_AndBeAddedWhenEditing()
    {
        var sale = await CreateAsync(Cash(Nov3, 3));

        var edit = await _client.PutAsJsonAsync(
            $"/api/sales/{sale.Id}",
            Cash(Nov3, 3) with { NewCustomer = new NewCustomerCommand("Mario Solís", null) });
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        var read = (await edit.Content.ReadFromJsonAsync<SaleDetail>())!;
        Assert.Equal("Mario Solís", read.Customer!.Name);
        Assert.Null(read.Customer.Phone);
        Assert.False(read.IsCredit);
    }

    [Fact]
    public async Task AnInvalidSale_AddsNoCustomer()
    {
        // The paid-now amount is the whole total, which is refused, so neither the sale nor the customer is saved.
        var command = Credit(Nov3, 5, Guid.Empty, paidNow: 5000) with
        {
            CustomerId = null,
            NewCustomer = new NewCustomerCommand("Ana Solano", null),
        };

        var response = await _client.PostAsJsonAsync("/api/sales", command);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        Assert.Empty((await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers"))!.Items);
        Assert.Empty((await ListAsync(Nov3, Nov3)).Sales);
    }

    [Fact]
    public async Task ANewCustomer_IsCheckedLikeOneFromClientes()
    {
        var command = Credit(Nov3, 5, Guid.Empty) with
        {
            CustomerId = null,
            NewCustomer = new NewCustomerCommand("   ", new string('1', Customer.PhoneMaxLength + 1)),
        };

        var response = await _client.PostAsJsonAsync("/api/sales", command);
        var errors = (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors;

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["Escriba el nombre del cliente."], errors["newCustomer.name"]);
        Assert.True(errors.ContainsKey("newCustomer.phone"));
        Assert.False(errors.ContainsKey("customerId"));
    }

    [Fact]
    public async Task ACustomer_AndANewOne_CantBothBeSent()
    {
        var luis = await CustomerAsync("Don Luis");
        var command = Credit(Nov3, 5, luis) with { NewCustomer = new NewCustomerCommand("Ana Solano", null) };

        var response = await _client.PostAsJsonAsync("/api/sales", command);
        var errors = (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors;

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(errors.ContainsKey("customerId"));
    }

    [Fact]
    public async Task AFiado_WithNoCustomerAtAll_IsStillRefused()
    {
        var command = Credit(Nov3, 5, Guid.Empty) with { CustomerId = null };

        var response = await _client.PostAsJsonAsync("/api/sales", command);
        var errors = (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors;

        Assert.Equal(["Escoja a quién se le fió."], errors["customerId"]);
    }
}
