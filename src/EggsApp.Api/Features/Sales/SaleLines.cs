using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Sales;

/// <summary>Writes the lines of a sale and its total, which the server always calculates itself.</summary>
internal static class SaleLines
{
    public static void Add(AppDbContext db, Sale sale, IReadOnlyList<SaleItemFields> items)
    {
        var lines = items.Select((item, index) => new SaleItem
        {
            SaleId = sale.Id,
            Position = index,
            CartonType = item.CartonType,
            Quantity = item.Quantity,
            UnitPrice = item.UnitPrice,
            LineTotal = item.Quantity * item.UnitPrice,
        }).ToList();

        db.SaleItems.AddRange(lines);
        sale.Total = lines.Sum(line => line.LineTotal);
    }
}
