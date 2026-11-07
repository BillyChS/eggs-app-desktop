using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Expenses;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Reports;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace EggsApp.Tests.Features.Reports;

/// <summary>The summary, and that it agrees with the screens it's put together from. A new factory per test.</summary>
public sealed class SummaryEndpointTests : IDisposable
{
    private static readonly Guid Alimento = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0001");
    private static readonly Guid Vitaminas = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0002");
    private static readonly Guid Cartones = Guid.Parse("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0005");

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public SummaryEndpointTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private async Task<T> PostAsync<T>(string path, object body)
    {
        var response = await _client.PostAsJsonAsync(path, body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private Task<CustomerDetail> CustomerAsync(string name) =>
        PostAsync<CustomerDetail>("/api/customers", new CustomerCommand(name, null, null));

    /// <param name="fifteens">Cartons of 15 at ₡1.000.</param>
    /// <param name="thirties">Cartons of 30 at ₡2.000.</param>
    private Task<SaleDetail> SaleAsync(string date, long fifteens, long thirties = 0, Guid? creditTo = null)
    {
        var items = new List<SaleItemCommand?>();

        if (fifteens > 0)
        {
            items.Add(new SaleItemCommand("A", fifteens, 1000));
        }

        if (thirties > 0)
        {
            items.Add(new SaleItemCommand("B", thirties, 2000));
        }

        return PostAsync<SaleDetail>("/api/sales", new SaleCommand(date, items, creditTo is not null, creditTo));
    }

    private Task<PaymentDetail> AbonoAsync(Guid customerId, string date, long amount) =>
        PostAsync<PaymentDetail>($"/api/customers/{customerId}/payments", new PaymentCommand(date, amount, null));

    private Task<ExpenseDetail> ExpenseAsync(string date, Guid categoryId, long amount, string? note = null) =>
        PostAsync<ExpenseDetail>("/api/expenses", new ExpenseCommand(date, categoryId, amount, note));

    private async Task<SummaryResponse> SummaryAsync(string from, string to) =>
        (await _client.GetFromJsonAsync<SummaryResponse>($"/api/reports/summary?from={from}&to={to}"))!;

    [Fact]
    public async Task Totals_AreCashBasis_AcrossSalesAbonosAndExpenses()
    {
        var maria = await CustomerAsync("María");
        await SaleAsync("2024-11-04", fifteens: 3);                       // cash ₡3.000
        await SaleAsync("2024-11-04", fifteens: 0, thirties: 2);          // cash ₡4.000
        await SaleAsync("2024-11-05", fifteens: 5, creditTo: maria.Id);   // fiado ₡5.000: owed, not income
        await AbonoAsync(maria.Id, "2024-11-06", 2000);                   // income on the day it was paid
        await ExpenseAsync("2024-11-05", Alimento, 1500);

        var summary = await SummaryAsync("2024-11-04", "2024-11-10");

        Assert.Equal(new DateOnly(2024, 11, 4), summary.From);
        Assert.Equal(new DateOnly(2024, 11, 10), summary.To);
        Assert.Equal(7000, summary.CameIn.Cash);
        Assert.Equal(2000, summary.CameIn.Payments);
        Assert.Equal(9000, summary.CameIn.Total);
        Assert.Equal(1500, summary.Spent.Total);
        Assert.Equal(7500, summary.Net);
        Assert.Equal(5000, summary.CreditSold);
        Assert.Equal(3000, summary.OwedTotal);
    }

    [Fact]
    public async Task AnAbono_CountsOnTheDayItWasPaid_NotOnTheDayOfTheSale()
    {
        var maria = await CustomerAsync("María");
        await SaleAsync("2024-10-30", fifteens: 5, creditTo: maria.Id);
        await AbonoAsync(maria.Id, "2024-11-02", 5000);

        var october = await SummaryAsync("2024-10-01", "2024-10-31");
        var november = await SummaryAsync("2024-11-01", "2024-11-30");

        Assert.Equal(0, october.CameIn.Total);
        Assert.Equal(5000, october.CreditSold);
        Assert.Equal(5000, november.CameIn.Payments);
        Assert.Equal(0, november.CreditSold);
        Assert.Equal(0, november.OwedTotal);
    }

    [Fact]
    public async Task Net_GoesBelowZero_WhenMoreWasSpent()
    {
        await SaleAsync("2024-11-04", fifteens: 2);
        await ExpenseAsync("2024-11-04", Alimento, 31000);

        var summary = await SummaryAsync("2024-11-04", "2024-11-04");

        Assert.Equal(-29000, summary.Net);
        Assert.Equal(-29000, Assert.Single(summary.Days).Net);
    }

    [Fact]
    public async Task AWeek_FromMondayToSunday_IncludesBothEndsAndNothingOutside()
    {
        // 2024-11-04 is a Monday and 2024-11-10 a Sunday.
        Assert.Equal(DayOfWeek.Monday, new DateOnly(2024, 11, 4).DayOfWeek);
        await SaleAsync("2024-11-03", fifteens: 100);  // Sunday before
        await SaleAsync("2024-11-04", fifteens: 1);
        await SaleAsync("2024-11-10", fifteens: 2);
        await SaleAsync("2024-11-11", fifteens: 100);  // Monday after
        await ExpenseAsync("2024-11-03", Alimento, 900);
        await ExpenseAsync("2024-11-10", Alimento, 500);

        var week = await SummaryAsync("2024-11-04", "2024-11-10");

        Assert.Equal(3000, week.CameIn.Total);
        Assert.Equal(500, week.Spent.Total);
        Assert.Equal([new DateOnly(2024, 11, 4), new DateOnly(2024, 11, 10)], week.Days.Select(day => day.Date));
    }

    [Theory]
    [InlineData("2024-02-01", "2024-02-29", 2)]  // leap year
    [InlineData("2023-02-01", "2023-02-28", 2)]
    [InlineData("2024-10-01", "2024-10-31", 2)]
    public async Task AMonth_IncludesItsFirstAndLastDays_AndNothingOutside(string from, string to, int salesInside)
    {
        // Each month has a sale on its first and last day, and on the days just outside it.
        foreach (var day in new[] { "2023-01-31", "2023-02-01", "2023-02-28", "2023-03-01", "2024-01-31",
                     "2024-02-01", "2024-02-29", "2024-03-01", "2024-09-30", "2024-10-01", "2024-10-31", "2024-11-01" })
        {
            await SaleAsync(day, fifteens: 1);
        }

        var month = await SummaryAsync(from, to);

        Assert.Equal(salesInside * 1000, month.CameIn.Cash);
        Assert.Equal(salesInside, month.Days.Count);
    }

    [Fact]
    public async Task DeletedSalesAbonosAndExpenses_AreLeftOut()
    {
        var maria = await CustomerAsync("María");
        var keptSale = await SaleAsync("2024-11-04", fifteens: 3);
        var deletedSale = await SaleAsync("2024-11-04", fifteens: 7);
        var deletedCredit = await SaleAsync("2024-11-04", fifteens: 4, creditTo: maria.Id);
        await SaleAsync("2024-11-04", fifteens: 6, creditTo: maria.Id);
        var deletedAbono = await AbonoAsync(maria.Id, "2024-11-04", 1000);
        var deletedExpense = await ExpenseAsync("2024-11-04", Alimento, 9000);
        await ExpenseAsync("2024-11-04", Vitaminas, 800);

        foreach (var path in new[]
                 {
                     $"/api/sales/{deletedSale.Id}", $"/api/payments/{deletedAbono.Id}",
                     $"/api/sales/{deletedCredit.Id}", $"/api/expenses/{deletedExpense.Id}",
                 })
        {
            Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync(path)).StatusCode);
        }

        var summary = await SummaryAsync("2024-11-04", "2024-11-04");

        Assert.Equal(keptSale.Total, summary.CameIn.Total);
        Assert.Equal(6000, summary.CreditSold);
        Assert.Equal(800, summary.Spent.Total);
        Assert.Equal([new CategorySpent("Vitaminas", 800)], summary.Spent.ByCategory);
        Assert.Equal([new CartonsSold("A", 9)], summary.Cartons);
        Assert.Equal(6000, summary.OwedTotal);
    }

    [Fact]
    public async Task Spending_IsGroupedByCategory_LargestFirst_IncludingARetiredOne()
    {
        await ExpenseAsync("2024-11-04", Alimento, 20000);
        await ExpenseAsync("2024-11-05", Alimento, 11000);
        await ExpenseAsync("2024-11-05", Vitaminas, 4000);
        await ExpenseAsync("2024-11-06", Cartones, 2500);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.ExpenseCategories.Remove(await db.ExpenseCategories.SingleAsync(category => category.Id == Cartones));
            await db.SaveChangesAsync();
        }

        var summary = await SummaryAsync("2024-11-01", "2024-11-30");

        Assert.Equal(
            [new CategorySpent("Alimento", 31000), new CategorySpent("Vitaminas", 4000), new CategorySpent("Cartones", 2500)],
            summary.Spent.ByCategory);
        Assert.Equal(37500, summary.Spent.Total);
    }

    [Fact]
    public async Task Cartons_CountCashAndCredit_ByType()
    {
        var maria = await CustomerAsync("María");
        await SaleAsync("2024-11-04", fifteens: 3, thirties: 2);
        await SaleAsync("2024-11-05", fifteens: 4, creditTo: maria.Id);
        await SaleAsync("2024-11-05", fifteens: 0, thirties: 1);

        var summary = await SummaryAsync("2024-11-01", "2024-11-30");

        Assert.Equal([new CartonsSold("A", 7), new CartonsSold("B", 3)], summary.Cartons);
    }

    [Fact]
    public async Task Days_ListEachDayWithActivity_OldestFirst_ACreditOnlyDayAtZero()
    {
        var maria = await CustomerAsync("María");
        await SaleAsync("2024-11-06", fifteens: 2);
        await ExpenseAsync("2024-11-06", Alimento, 500);
        await SaleAsync("2024-11-04", fifteens: 5, creditTo: maria.Id);
        await AbonoAsync(maria.Id, "2024-11-08", 1000);

        var summary = await SummaryAsync("2024-11-01", "2024-11-30");

        Assert.Equal(
            [
                new DaySummary(new DateOnly(2024, 11, 4), 0, 0),
                new DaySummary(new DateOnly(2024, 11, 6), 2000, 500),
                new DaySummary(new DateOnly(2024, 11, 8), 1000, 0),
            ],
            summary.Days);
    }

    [Fact]
    public async Task AnEmptyPeriod_IsAllZeros()
    {
        var summary = await SummaryAsync("2024-11-01", "2024-11-30");

        Assert.Equal(0, summary.CameIn.Total);
        Assert.Equal(0, summary.Spent.Total);
        Assert.Equal(0, summary.Net);
        Assert.Empty(summary.Spent.ByCategory);
        Assert.Empty(summary.Cartons);
        Assert.Empty(summary.Days);
    }

    [Fact]
    public async Task Totals_MatchWhatTheOtherScreensShow_ForTheSameRange()
    {
        var maria = await CustomerAsync("María");
        var ana = await CustomerAsync("Ana");
        await SaleAsync("2024-11-02", fifteens: 3, thirties: 1);
        await SaleAsync("2024-11-03", fifteens: 2, creditTo: maria.Id);
        await SaleAsync("2024-11-03", fifteens: 0, thirties: 4, creditTo: ana.Id);
        await AbonoAsync(maria.Id, "2024-11-04", 1500);
        await AbonoAsync(ana.Id, "2024-11-05", 3000);
        await ExpenseAsync("2024-11-02", Alimento, 31000);
        await ExpenseAsync("2024-11-05", Vitaminas, 2500);
        const string Range = "from=2024-11-01&to=2024-11-30";

        var summary = await SummaryAsync("2024-11-01", "2024-11-30");
        var sales = (await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?{Range}"))!;
        var payments = (await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?{Range}"))!;
        var expenses = (await _client.GetFromJsonAsync<ExpenseListResponse>($"/api/expenses?{Range}"))!;
        var customers = (await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers"))!;

        Assert.Equal(sales.CashTotal, summary.CameIn.Cash);
        Assert.Equal(sales.CreditTotal, summary.CreditSold);
        Assert.Equal(payments.Total, summary.CameIn.Payments);
        Assert.Equal(expenses.Total, summary.Spent.Total);
        Assert.Equal(customers.OwedTotal, summary.OwedTotal);

        // And day by day, against Ventas' "Entró" (cash + abonos) and Gastos' "Gastado".
        foreach (var day in summary.Days)
        {
            var dayRange = $"from={day.Date:yyyy-MM-dd}&to={day.Date:yyyy-MM-dd}";
            var daySales = (await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?{dayRange}"))!;
            var dayPayments = (await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?{dayRange}"))!;
            var dayExpenses = (await _client.GetFromJsonAsync<ExpenseListResponse>($"/api/expenses?{dayRange}"))!;

            Assert.Equal(daySales.CashTotal + dayPayments.Total, day.CameIn);
            Assert.Equal(dayExpenses.Total, day.Spent);
        }
    }

    [Theory]
    [InlineData("from=2024-11-05&to=2024-11-01", "to", "La fecha final no puede ser antes de la inicial.")]
    [InlineData("from=2024-01-01&to=2025-01-01", "to", "El período no puede ser de más de un año.")]
    [InlineData("from=nada&to=2024-11-01", "from", "Esa fecha no es válida.")]
    [InlineData("to=2024-11-01", "from", "Esa fecha no es válida.")]
    public async Task ABadRange_IsRefused(string query, string field, string message)
    {
        var response = await _client.GetAsync($"/api/reports/summary?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([message], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors[field]);
    }

    [Fact]
    public async Task AWholeLeapYear_IsAllowed()
    {
        var response = await _client.GetAsync("/api/reports/summary?from=2024-01-01&to=2024-12-31");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
