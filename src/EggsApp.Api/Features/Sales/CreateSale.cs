using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Sales;

public static class CreateSale
{
    public static async Task<SaleDetail> HandleAsync(AppDbContext db, SaleFields fields)
    {
        var sale = new Sale { SaleDate = fields.Date };

        db.Sales.Add(sale);
        SaleLines.Add(db, sale, fields.Items);
        await db.SaveChangesAsync();

        return SaleDetail.From(sale);
    }
}
