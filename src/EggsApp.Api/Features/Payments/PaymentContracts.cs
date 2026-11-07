using EggsApp.Api.Features.Customers;

namespace EggsApp.Api.Features.Payments;

/// <summary>What the UI sends. The customer is in the address when creating, and never changes after.</summary>
public sealed record PaymentCommand(string? Date, long? Amount, string? Note);

/// <summary>A command that passed validation. Whether the customer owes that much is the handler's to check.</summary>
public sealed record PaymentFields(DateOnly Date, long Amount, string? Note);

/// <param name="Customer">Who paid, even if they were deleted since.</param>
/// <param name="SaleId">The credit sale it was paid with, as the sale was made; it changes from there only.</param>
public sealed record PaymentDetail(
    Guid Id,
    CustomerRef Customer,
    DateOnly Date,
    long Amount,
    string? Note,
    Guid? SaleId = null)
{
    public static PaymentDetail From(Payment payment, IReadOnlyDictionary<Guid, CustomerRef> customers) =>
        new(payment.Id, customers[payment.CustomerId], payment.PaymentDate, payment.Amount, payment.Note, payment.SaleId);
}

/// <param name="Total">The abonos added up: income of the period, on the days they were paid.</param>
public sealed record PaymentListResponse(IReadOnlyList<PaymentDetail> Payments, long Total);
