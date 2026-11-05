using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class DeleteSale
{
    /// <summary>Soft delete doesn't reach rows that aren't loaded, so the lines are loaded and deleted with the sale.</summary>
    /// <returns>False if there's no active sale with that id.</returns>
    public static async Task<bool> HandleAsync(AppDbContext db, Guid id)
    {
        var sale = await db.Sales.Include(candidate => candidate.Items).FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (sale is null)
        {
            return false;
        }

        db.SaleItems.RemoveRange(sale.Items);
        db.Sales.Remove(sale);
        await db.SaveChangesAsync();

        return true;
    }
}
