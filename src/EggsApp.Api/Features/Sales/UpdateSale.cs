using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class UpdateSale
{
    /// <summary>The sale keeps its id and gets a whole new set of lines. The old ones stay, soft-deleted.</summary>
    /// <returns>The sale as saved, or null if there's no active sale with that id.</returns>
    public static async Task<SaleDetail?> HandleAsync(AppDbContext db, Guid id, SaleFields fields)
    {
        var sale = await db.Sales.Include(candidate => candidate.Items).FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (sale is null)
        {
            return null;
        }

        db.SaleItems.RemoveRange(sale.Items);
        SaleLines.Add(db, sale, fields.Items);
        sale.SaleDate = fields.Date;

        // Marked by hand: a new set of lines with the same date and total wouldn't otherwise touch UpdatedAt.
        db.Entry(sale).State = EntityState.Modified;
        await db.SaveChangesAsync();

        return SaleDetail.From(sale);
    }
}
