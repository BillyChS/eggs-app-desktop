using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace EggsApp.Tests.Features.Payments;

/// <summary>Credit sales, abonos and the balances they add up to. A new factory per test, so every total is known.</summary>
public sealed class CreditEndpointsTests : IDisposable
{
    private const string Nov3 = "2024-11-03";
    private const string Nov4 = "2024-11-04";
    private const string Nov5 = "2024-11-05";

    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public CreditEndpointsTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    /// <summary>A sale of one line of type A at ₡1.000 a carton, so its total is the quantity times 1.000.</summary>
    private static SaleCommand Sale(string date, long thousands, Guid? creditTo = null) =>
        new(date, [new SaleItemCommand("A", thousands, 1000)], creditTo is not null, creditTo);

    private async Task<Guid> CreateCustomerAsync(string name)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CustomerDetail>())!.Id;
    }

    private async Task<SaleDetail> CreateSaleAsync(SaleCommand command)
    {
        var response = await _client.PostAsJsonAsync("/api/sales", command);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SaleDetail>())!;
    }

    private Task<HttpResponseMessage> PostPaymentAsync(Guid customerId, string? date, long? amount, string? note = null) =>
        _client.PostAsJsonAsync($"/api/customers/{customerId}/payments", new PaymentCommand(date, amount, note));

    private async Task<PaymentDetail> CreatePaymentAsync(Guid customerId, string date, long amount, string? note = null)
    {
        var response = await PostPaymentAsync(customerId, date, amount, note);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PaymentDetail>())!;
    }

    private async Task<long> BalanceAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerDetail>($"/api/customers/{customerId}"))!.Balance;

    private async Task<CustomerStatement> StatementAsync(Guid customerId) =>
        (await _client.GetFromJsonAsync<CustomerStatement>($"/api/customers/{customerId}/statement"))!;

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

    [Fact]
    public async Task CreditSale_NeedsACustomer_AndACashSaleHasNone()
    {
        var maria = await CreateCustomerAsync("María");

        var noCustomer = await _client.PostAsJsonAsync("/api/sales", new SaleCommand(Nov3, Sale(Nov3, 1).Items, true));
        var cashWithCustomer = await _client.PostAsJsonAsync(
            "/api/sales",
            new SaleCommand(Nov3, Sale(Nov3, 1).Items, false, maria));

        Assert.Equal(["Escoja a quién se le fió."], (await ReadErrorsAsync(noCustomer))["customerId"]);
        Assert.Equal(["Una venta al contado no lleva cliente."], (await ReadErrorsAsync(cashWithCustomer))["customerId"]);
    }

    [Fact]
    public async Task CreditSale_ToACustomerWhoDoesNotExist_IsRefused()
    {
        var response = await _client.PostAsJsonAsync("/api/sales", Sale(Nov3, 1, creditTo: Guid.NewGuid()));

        Assert.Equal(["Ese cliente ya no existe. Escoja otro."], (await ReadErrorsAsync(response))["customerId"]);
    }

    [Fact]
    public async Task CreditSale_IsReturnedWithItsCustomer_AndOldSalesStayCash()
    {
        var maria = await CreateCustomerAsync("María Rodríguez");

        var credit = await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        var cash = await CreateSaleAsync(Sale(Nov3, 3));

        Assert.True(credit.IsCredit);
        Assert.Equal(new CustomerRef(maria, "María Rodríguez", false), credit.Customer);
        Assert.False(cash.IsCredit);
        Assert.Null(cash.Customer);

        var read = await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{credit.Id}");
        Assert.Equal(credit.Customer, read!.Customer);
    }

    [Fact]
    public async Task DayTotals_AreCashBasis_CreditIsOwedAndAbonosCountOnTheDayPaid()
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 3));
        await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        await CreateSaleAsync(Sale(Nov4, 2));
        await CreatePaymentAsync(maria, Nov4, 1500);
        await CreatePaymentAsync(maria, Nov5, 500);

        var nov3 = await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}");
        var nov4Sales = await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov4}&to={Nov4}");
        var nov3Payments = await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?from={Nov3}&to={Nov3}");
        var nov4Payments = await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?from={Nov4}&to={Nov4}");
        var all = await _client.GetFromJsonAsync<PaymentListResponse>($"/api/payments?from={Nov3}&to={Nov5}");

        Assert.Equal((3000, 5000), (nov3!.CashTotal, nov3.CreditTotal));
        Assert.Equal((2000, 0), (nov4Sales!.CashTotal, nov4Sales.CreditTotal));
        Assert.Equal(0, nov3Payments!.Total);
        Assert.Empty(nov3Payments.Payments);
        Assert.Equal(1500, nov4Payments!.Total);
        Assert.Equal("María", Assert.Single(nov4Payments.Payments).Customer.Name);
        Assert.Equal([500, 1500], all!.Payments.Select(payment => payment.Amount));
        Assert.Equal(2000, all.Total);
    }

    [Fact]
    public async Task Payments_RefuseABadRangeInSpanish()
    {
        var response = await _client.GetAsync($"/api/payments?from={Nov4}&to={Nov3}");

        Assert.Equal(["La fecha final no puede ser antes de la inicial."], (await ReadErrorsAsync(response))["to"]);
    }

    [Fact]
    public async Task Balance_IsCreditSalesMinusAbonos_InTheListAndTheCustomer()
    {
        var maria = await CreateCustomerAsync("María");
        var pedro = await CreateCustomerAsync("Pedro");
        await CreateCustomerAsync("Ana");
        await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        await CreateSaleAsync(Sale(Nov4, 3, creditTo: maria));
        await CreateSaleAsync(Sale(Nov4, 2, creditTo: pedro));
        await CreateSaleAsync(Sale(Nov4, 9));
        await CreatePaymentAsync(maria, Nov5, 2000);
        await CreatePaymentAsync(pedro, Nov5, 2000);

        var list = await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers");
        var searched = await _client.GetFromJsonAsync<CustomerListResponse>("/api/customers?search=pedro");

        Assert.Equal(
            [("Ana", 0L), ("María", 6000L), ("Pedro", 0L)],
            list!.Items.Select(customer => (customer.Name, customer.Balance)));
        Assert.Equal(6000, list.OwedTotal);
        Assert.Equal(6000, searched!.OwedTotal);
        Assert.Equal(6000, await BalanceAsync(maria));
    }

    [Fact]
    public async Task Payment_IsStoredAndSaysWhere()
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));

        var response = await PostPaymentAsync(maria, Nov4, 2000, "  pagó la mitad  ");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<PaymentDetail>())!;
        Assert.Equal($"/api/payments/{created.Id}", response.Headers.Location!.ToString());
        var expected = new PaymentDetail(created.Id, new(maria, "María", false), new(2024, 11, 4), 2000, "pagó la mitad");
        Assert.Equal(expected, created);
        Assert.Equal(created, await _client.GetFromJsonAsync<PaymentDetail>(response.Headers.Location));
        Assert.Equal(3000, await BalanceAsync(maria));

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(Nov4, TestDatabaseFolder.Scalar(connection, "SELECT PaymentDate FROM Payments"));
    }

    [Theory]
    [InlineData(null, 1000L, null, "date", "Escoja la fecha del abono.")]
    [InlineData("2024-02-30", 1000L, null, "date", "Esa fecha no es válida.")]
    [InlineData("1999-12-31", 1000L, null, "date", "Revise el año de la fecha.")]
    [InlineData(Nov4, null, null, "amount", "Escriba el monto del abono.")]
    [InlineData(Nov4, 0L, null, "amount", "Escriba el monto del abono.")]
    [InlineData(Nov4, -5L, null, "amount", "Escriba el monto del abono.")]
    public async Task Payment_RefusesBadFieldsInSpanish(string? date, long? amount, string? note, string field, string message)
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));

        var response = await PostPaymentAsync(maria, date, amount, note);

        Assert.Equal([message], (await ReadErrorsAsync(response))[field]);
        Assert.Equal(5000, await BalanceAsync(maria));
    }

    [Fact]
    public async Task Payment_RefusesTomorrowAndALongNote()
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        var tomorrow = DateOnly.FromDateTime(DateTime.Now).AddDays(1).ToString("yyyy-MM-dd");

        var future = await PostPaymentAsync(maria, tomorrow, 1000);
        var longNote = await PostPaymentAsync(maria, Nov4, 1000, new string('a', Payment.NoteMaxLength + 1));
        var longestNote = await PostPaymentAsync(maria, Nov4, 1000, new string('a', Payment.NoteMaxLength));

        Assert.Equal(["La fecha no puede ser futura."], (await ReadErrorsAsync(future))["date"]);
        Assert.Equal(["La nota no puede tener más de 200 letras."], (await ReadErrorsAsync(longNote))["note"]);
        Assert.Equal(HttpStatusCode.Created, longestNote.StatusCode);
    }

    [Fact]
    public async Task Payment_CanPayItAllButNotMore()
    {
        var maria = await CreateCustomerAsync("María Rodríguez");
        await CreateSaleAsync(Sale(Nov3, 8, creditTo: maria));

        var tooMuch = await PostPaymentAsync(maria, Nov4, 8001);
        var everything = await PostPaymentAsync(maria, Nov4, 8000);
        var afterwards = await PostPaymentAsync(maria, Nov4, 1);

        Assert.Equal(
            ["María Rodríguez debe ₡8.000. El abono no puede ser mayor."],
            (await ReadErrorsAsync(tooMuch))["amount"]);
        Assert.Equal(HttpStatusCode.Created, everything.StatusCode);
        Assert.Equal(["María Rodríguez está al día: no debe nada."], (await ReadErrorsAsync(afterwards))["amount"]);
        Assert.Equal(0, await BalanceAsync(maria));
    }

    [Fact]
    public async Task Payment_ToACustomerWhoDoesNotExist_IsNotFound()
    {
        var response = await PostPaymentAsync(Guid.NewGuid(), Nov4, 1000);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PaymentEdit_ChangesItWithinWhatWasOwedWithoutIt()
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 10, creditTo: maria));
        await CreatePaymentAsync(maria, Nov4, 3000);
        var payment = await CreatePaymentAsync(maria, Nov4, 2000, "primero");

        var tooMuch = await _client.PutAsJsonAsync($"/api/payments/{payment.Id}", new PaymentCommand(Nov5, 7001, null));
        var raised = await _client.PutAsJsonAsync($"/api/payments/{payment.Id}", new PaymentCommand(Nov5, 7000, " "));

        Assert.Equal(
            ["Sin este abono, María debería ₡7.000. El abono no puede ser mayor."],
            (await ReadErrorsAsync(tooMuch))["amount"]);
        Assert.Equal(HttpStatusCode.OK, raised.StatusCode);
        var read = await _client.GetFromJsonAsync<PaymentDetail>($"/api/payments/{payment.Id}");
        Assert.Equal((new DateOnly(2024, 11, 5), 7000L, (string?)null), (read!.Date, read.Amount, read.Note));
        Assert.Equal(0, await BalanceAsync(maria));
    }

    [Fact]
    public async Task PaymentDelete_RaisesTheBalanceAgain()
    {
        var maria = await CreateCustomerAsync("María");
        await CreateSaleAsync(Sale(Nov3, 10, creditTo: maria));
        var payment = await CreatePaymentAsync(maria, Nov4, 4000);

        var deleted = await _client.DeleteAsync($"/api/payments/{payment.Id}");
        var again = await _client.DeleteAsync($"/api/payments/{payment.Id}");
        var edit = await _client.PutAsJsonAsync($"/api/payments/{payment.Id}", new PaymentCommand(Nov4, 1, null));

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/payments/{payment.Id}")).StatusCode);
        Assert.Equal(10000, await BalanceAsync(maria));

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT IsDeleted FROM Payments"));
    }

    [Fact]
    public async Task Statement_ListsCreditSalesAndAbonosNewestFirstWithTheRunningBalance()
    {
        var maria = await CreateCustomerAsync("María");
        var pedro = await CreateCustomerAsync("Pedro");

        // Entered out of order: what counts is the day, then the order of entry within a day.
        var second = await CreateSaleAsync(Sale(Nov4, 3, creditTo: maria));
        var first = await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        var third = await CreatePaymentAsync(maria, Nov4, 2000, "la mitad");
        var fourth = await CreateSaleAsync(Sale(Nov4, 1, creditTo: maria));
        var removed = await CreatePaymentAsync(maria, Nov5, 1000);
        await _client.DeleteAsync($"/api/payments/{removed.Id}");
        await CreateSaleAsync(Sale(Nov4, 4));
        await CreateSaleAsync(Sale(Nov4, 4, creditTo: pedro));

        var statement = await StatementAsync(maria);

        Assert.Equal((maria, "María", 7000L), (statement.Id, statement.Name, statement.Balance));
        Assert.Equal(
            [
                ("sale", fourth.Id, Nov4, 1000L, 7000L),
                ("payment", third.Id, Nov4, 2000L, 6000L),
                ("sale", second.Id, Nov4, 3000L, 8000L),
                ("sale", first.Id, Nov3, 5000L, 5000L),
            ],
            statement.Entries.Select(entry =>
                (entry.Kind, entry.Id, entry.Date.ToString("yyyy-MM-dd"), entry.Amount, entry.Balance)));
        Assert.Equal("la mitad", statement.Entries[1].Note);
        Assert.Equal([new SaleItemDetail("A", 3, 1000, 3000)], statement.Entries[2].Items);
        Assert.Null(statement.Entries[1].Items);
    }

    [Fact]
    public async Task Statement_OfSomeoneWithNothing_IsEmpty_AndOfNobodyIsNotFound()
    {
        var ana = await CreateCustomerAsync("Ana");

        var statement = await StatementAsync(ana);

        Assert.Equal(0, statement.Balance);
        Assert.Empty(statement.Entries);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/customers/{Guid.NewGuid()}/statement")).StatusCode);
    }

    [Fact]
    public async Task CreditSaleEdit_AfterAbonos_ChangesTheBalanceButNotBelowWhatWasPaid()
    {
        var maria = await CreateCustomerAsync("María Rodríguez");
        var sale = await CreateSaleAsync(Sale(Nov3, 10, creditTo: maria));
        await CreatePaymentAsync(maria, Nov4, 6000);

        var raised = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 12, creditTo: maria));
        Assert.Equal(6000, await BalanceAsync(maria));

        var lowered = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov4, 6, creditTo: maria));
        Assert.Equal(0, await BalanceAsync(maria));

        var tooLow = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov4, 5, creditTo: maria));
        var toCash = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov4, 6));

        Assert.Equal(HttpStatusCode.OK, raised.StatusCode);
        Assert.Equal(HttpStatusCode.OK, lowered.StatusCode);
        Assert.Equal(
            "María Rodríguez ya abonó ₡6.000, y con este cambio sus fiados sumarían ₡5.000. " +
            "Primero corrija o borre un abono de María Rodríguez.",
            await ReadRefusalAsync(tooLow));
        Assert.Contains("sus fiados sumarían ₡0", await ReadRefusalAsync(toCash));

        var kept = await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{sale.Id}");
        Assert.Equal((6000L, true), (kept!.Total, kept.IsCredit));
    }

    [Fact]
    public async Task CreditSaleEdit_CanSwitchBetweenCashAndCreditAndMoveToAnotherCustomer()
    {
        var maria = await CreateCustomerAsync("María");
        var pedro = await CreateCustomerAsync("Pedro");
        var sale = await CreateSaleAsync(Sale(Nov3, 4));

        await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 4, creditTo: maria));
        Assert.Equal((4000, 0), (await BalanceAsync(maria), await BalanceAsync(pedro)));

        await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 4, creditTo: pedro));
        Assert.Equal((0, 4000), (await BalanceAsync(maria), await BalanceAsync(pedro)));

        await CreatePaymentAsync(pedro, Nov4, 1000);
        var awayFromPedro = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 4, creditTo: maria));
        Assert.Contains("Pedro ya abonó ₡1.000", await ReadRefusalAsync(awayFromPedro));

        await CreateSaleAsync(Sale(Nov4, 1, creditTo: pedro));
        var covered = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 4));
        Assert.Equal(HttpStatusCode.OK, covered.StatusCode);
        Assert.Equal((0, 0), (await BalanceAsync(maria), await BalanceAsync(pedro)));

        var list = await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}");
        Assert.Equal((4000, 0), (list!.CashTotal, list.CreditTotal));
    }

    [Fact]
    public async Task CreditSaleEdit_ToACustomerWhoDoesNotExist_IsRefused()
    {
        var sale = await CreateSaleAsync(Sale(Nov3, 4));

        var response = await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 4, creditTo: Guid.NewGuid()));

        Assert.Equal(["Ese cliente ya no existe. Escoja otro."], (await ReadErrorsAsync(response))["customerId"]);
    }

    [Fact]
    public async Task CreditSaleDelete_LowersTheBalanceButNotBelowWhatWasPaid()
    {
        var maria = await CreateCustomerAsync("María");
        var big = await CreateSaleAsync(Sale(Nov3, 5, creditTo: maria));
        var small = await CreateSaleAsync(Sale(Nov3, 2, creditTo: maria));
        await CreatePaymentAsync(maria, Nov4, 3000);

        var refused = await _client.DeleteAsync($"/api/sales/{big.Id}");
        var deleted = await _client.DeleteAsync($"/api/sales/{small.Id}");

        Assert.Equal(
            "María ya abonó ₡3.000, y sin esta venta sus fiados sumarían ₡2.000. Primero corrija o borre un abono de María.",
            await ReadRefusalAsync(refused));
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(2000, await BalanceAsync(maria));
    }

    [Fact]
    public async Task CustomerDelete_IsRefusedWhileTheyOweAndAllowedOnceUpToDate()
    {
        var maria = await CreateCustomerAsync("María Rodríguez");
        await CreateSaleAsync(Sale(Nov3, 8, creditTo: maria));

        var refused = await _client.DeleteAsync($"/api/customers/{maria}");
        Assert.Equal(
            "María Rodríguez todavía debe ₡8.000. Solo se puede borrar un cliente que esté al día.",
            await ReadRefusalAsync(refused));
        Assert.Equal(8000, await BalanceAsync(maria));

        await CreatePaymentAsync(maria, Nov4, 8000);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/customers/{maria}")).StatusCode);
    }

    [Fact]
    public async Task DeletedCustomer_StillNamesTheirEntries_WhichCanNoLongerChange()
    {
        var maria = await CreateCustomerAsync("María Rodríguez");
        var sale = await CreateSaleAsync(Sale(Nov3, 3, creditTo: maria));
        var payment = await CreatePaymentAsync(maria, Nov4, 3000);
        (await _client.DeleteAsync($"/api/customers/{maria}")).EnsureSuccessStatusCode();

        var gone = new CustomerRef(maria, "María Rodríguez", true);
        var list = await _client.GetFromJsonAsync<SaleListResponse>($"/api/sales?from={Nov3}&to={Nov3}");
        Assert.Equal(gone, Assert.Single(list!.Sales).Customer);
        Assert.Equal(gone, (await _client.GetFromJsonAsync<SaleDetail>($"/api/sales/{sale.Id}"))!.Customer);
        Assert.Equal(gone, (await _client.GetFromJsonAsync<PaymentDetail>($"/api/payments/{payment.Id}"))!.Customer);

        const string SaleRefusal =
            "Esta venta es de María Rodríguez, un cliente que se borró, así que ya no se puede cambiar.";
        const string PaymentRefusal =
            "Este abono es de María Rodríguez, un cliente que se borró, así que ya no se puede cambiar.";

        Assert.Equal(SaleRefusal, await ReadRefusalAsync(
            await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 9, creditTo: maria))));
        Assert.Equal(SaleRefusal, await ReadRefusalAsync(
            await _client.PutAsJsonAsync($"/api/sales/{sale.Id}", Sale(Nov3, 3))));
        Assert.Equal(SaleRefusal, await ReadRefusalAsync(await _client.DeleteAsync($"/api/sales/{sale.Id}")));
        Assert.Equal(PaymentRefusal, await ReadRefusalAsync(
            await _client.PutAsJsonAsync($"/api/payments/{payment.Id}", new PaymentCommand(Nov4, 1, null))));
        Assert.Equal(PaymentRefusal, await ReadRefusalAsync(await _client.DeleteAsync($"/api/payments/{payment.Id}")));

        Assert.Equal(HttpStatusCode.NotFound, (await PostPaymentAsync(maria, Nov4, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/customers/{maria}/statement")).StatusCode);
        var newSale = await _client.PostAsJsonAsync("/api/sales", Sale(Nov4, 1, creditTo: maria));
        Assert.Equal(["Ese cliente ya no existe. Escoja otro."], (await ReadErrorsAsync(newSale))["customerId"]);
    }

    [Fact]
    public async Task Database_RefusesACreditSaleWithoutACustomerEvenPastTheApi()
    {
        await CreateSaleAsync(Sale(Nov3, 1));

        using var connection = _factory.ConnectToDatabase();
        var exception = Assert.ThrowsAny<Exception>(() =>
            TestDatabaseFolder.Execute(connection, "UPDATE Sales SET IsCredit = 1"));

        Assert.Contains("CK_Sales_CreditHasCustomer", exception.Message);
    }
}
