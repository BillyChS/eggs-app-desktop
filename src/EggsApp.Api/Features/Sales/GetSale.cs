using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class GetSale
{
    /// <returns>The sale, or null if there's no active sale with that id.</returns>
    public static async Task<SaleDetail?> HandleAsync(AppDbContext db, Guid id)
    {
        var sale = await db.Sales
            .AsNoTracking()
            .Include(candidate => candidate.Items)
            .FirstOrDefaultAsync(candidate => candidate.Id == id);

        return sale is null ? null : SaleDetail.From(sale);
    }
}
