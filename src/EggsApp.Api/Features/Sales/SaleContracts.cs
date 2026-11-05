namespace EggsApp.Api.Features.Sales;

/// <summary>What the UI sends. Text and nullable, so that anything wrong gets a Spanish message from the validator.</summary>
public sealed record SaleCommand(string? Date, IReadOnlyList<SaleItemCommand?>? Items);

public sealed record SaleItemCommand(string? CartonType, long? Quantity, long? UnitPrice);

/// <summary>A command that passed validation.</summary>
public sealed record SaleFields(DateOnly Date, IReadOnlyList<SaleItemFields> Items);

public sealed record SaleItemFields(CartonType CartonType, long Quantity, long UnitPrice);

public sealed record SaleItemDetail(string CartonType, long Quantity, long UnitPrice, long LineTotal);

public sealed record SaleDetail(Guid Id, DateOnly Date, long Total, IReadOnlyList<SaleItemDetail> Items)
{
    public static SaleDetail From(Sale sale) => new(
        sale.Id,
        sale.SaleDate,
        sale.Total,
        [.. sale.Items
            .Where(item => !item.IsDeleted)
            .OrderBy(item => item.Position)
            .Select(item => new SaleItemDetail(
                item.CartonType.ToString(),
                item.Quantity,
                item.UnitPrice,
                item.LineTotal))]);
}

/// <param name="CashTotal">The income of the period. Credit sales won't count here: they become income as abonos.</param>
public sealed record SaleListResponse(IReadOnlyList<SaleDetail> Sales, long CashTotal);
