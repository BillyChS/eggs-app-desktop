using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Sales;

namespace EggsApp.Api.Features.Payments;

/// <summary>What the UI sends. The customer is in the address when creating, and never changes after.</summary>
public sealed record PaymentCommand(string? Date, long? Amount, string? Note);

/// <summary>A command that passed validation. Whether the customer owes that much is the handler's to check.</summary>
public sealed record PaymentFields(DateOnly Date, long Amount, string? Note);

/// <param name="Customer">Who paid, even if they were deleted since.</param>
/// <param name="SaleId">The credit sale it was paid with, as the sale was made; it changes from there only.</param>
/// <param name="ForSaleId">The credit sale it was paid toward from its Abonar button, which it pays first.</param>
/// <param name="ForSaleDate">That sale's date, while it isn't deleted; only where a list shows it.</param>
public sealed record PaymentDetail(
    Guid Id,
    CustomerRef Customer,
    DateOnly Date,
    long Amount,
    string? Note,
    Guid? SaleId = null,
    Guid? ForSaleId = null,
    DateOnly? ForSaleDate = null)
{
    public static PaymentDetail From(
        Payment payment,
        IReadOnlyDictionary<Guid, CustomerRef> customers,
        IReadOnlyDictionary<Guid, DateOnly>? saleDates = null) =>
        new(
            payment.Id,
            customers[payment.CustomerId],
            payment.PaymentDate,
            payment.Amount,
            payment.Note,
            payment.SaleId,
            payment.ForSaleId,
            payment.ForSaleId is { } saleId && saleDates?.TryGetValue(saleId, out var date) == true ? date : null);
}

/// <param name="Total">The abonos added up: income of the period, on the days they were paid.</param>
public sealed record PaymentListResponse(IReadOnlyList<PaymentDetail> Payments, long Total);

/// <summary>What the Abonar button sends: just the amount. The sale is in the address, and the day is today.</summary>
public sealed record SalePaymentCommand(long? Amount);

/// <summary>One abono, or the part of one, that went to a credit sale.</summary>
/// <param name="Applied">What of it went to this sale.</param>
/// <param name="Amount">The whole abono; more than Applied when the rest went to the customer's other fiados.</param>
/// <param name="PaidWithSale">Paid as the sale was made ("¿Pagó algo ahora?").</param>
public sealed record SalePaymentShare(Guid Id, DateOnly Date, long Applied, long Amount, bool PaidWithSale);

/// <summary>A credit sale and the abonos that paid it, for its Abonar and Ver abonos window.</summary>
/// <param name="Paid">What the abonos paid of it: the sale's total less what it still owes (Sale.Owed).</param>
/// <param name="Payments">Newest first. Applied adds up to Paid.</param>
public sealed record SalePaymentsResponse(
    SaleDetail Sale,
    long Paid,
    IReadOnlyList<SalePaymentShare> Payments);
