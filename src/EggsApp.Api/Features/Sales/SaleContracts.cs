using EggsApp.Api.Features.Customers;

namespace EggsApp.Api.Features.Sales;

/// <summary>What the UI sends. Text and nullable, so that anything wrong gets a Spanish message from the validator.</summary>
/// <param name="IsCredit">A credit sale ("fiado"), which needs a customer. Left out, the sale is a cash sale.</param>
/// <param name="CustomerId">Who owes a credit sale. Optional on a cash sale: who bought, which moves no balance.</param>
/// <param name="PaidNow">
/// What a credit sale's customer paid when it was made, saved as an abono tied to the sale. Null or 0 for none.
/// </param>
public sealed record SaleCommand(
    string? Date,
    IReadOnlyList<SaleItemCommand?>? Items,
    bool IsCredit = false,
    Guid? CustomerId = null,
    long? PaidNow = null);

public sealed record SaleItemCommand(string? CartonType, long? Quantity, long? UnitPrice);

/// <summary>A command that passed validation.</summary>
/// <param name="CustomerId">Who owes a credit sale, or who bought a cash sale; null for a cash sale with nobody.</param>
/// <param name="PaidNow">Paid when a credit sale was made, less than its total. Always 0 for a cash sale.</param>
public sealed record SaleFields(
    DateOnly Date,
    IReadOnlyList<SaleItemFields> Items,
    bool IsCredit,
    Guid? CustomerId,
    long PaidNow)
{
    public long Total => Items.Sum(item => item.Quantity * item.UnitPrice);
}

public sealed record SaleItemFields(CartonType CartonType, long Quantity, long UnitPrice);

public sealed record SaleItemDetail(string CartonType, long Quantity, long UnitPrice, long LineTotal)
{
    public static IReadOnlyList<SaleItemDetail> ListFrom(Sale sale) =>
    [
        .. sale.Items
            .Where(item => !item.IsDeleted)
            .OrderBy(item => item.Position)
            .Select(item => new SaleItemDetail(item.CartonType.ToString(), item.Quantity, item.UnitPrice, item.LineTotal)),
    ];
}

/// <param name="Customer">
/// Who owes a credit sale, or who bought a cash sale, even if they were deleted since; null for a cash sale with nobody.
/// </param>
/// <param name="PaidNow">The abono given when the credit sale was made (see Payment.SaleId); 0 if none.</param>
public sealed record SaleDetail(
    Guid Id,
    DateOnly Date,
    long Total,
    bool IsCredit,
    CustomerRef? Customer,
    IReadOnlyList<SaleItemDetail> Items,
    long PaidNow = 0)
{
    public static SaleDetail From(
        Sale sale,
        IReadOnlyDictionary<Guid, CustomerRef> customers,
        IReadOnlyDictionary<Guid, long> paidNow) => new(
        sale.Id,
        sale.SaleDate,
        sale.Total,
        sale.IsCredit,
        sale.CustomerId is { } customerId ? customers[customerId] : null,
        SaleItemDetail.ListFrom(sale),
        paidNow.GetValueOrDefault(sale.Id));
}

/// <param name="CashTotal">The income from sales in the period: cash sales only.</param>
/// <param name="CreditTotal">What was sold on credit in the period. Not income: it's owed, and comes in as abonos.</param>
public sealed record SaleListResponse(IReadOnlyList<SaleDetail> Sales, long CashTotal, long CreditTotal);
