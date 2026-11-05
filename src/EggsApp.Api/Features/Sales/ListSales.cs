using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class ListSales
{
    /// <returns>The sales from one date to another, both included, newest first, and the income they add up to.</returns>
    public static async Task<SaleListResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var sales = await db.Sales
            .AsNoTracking()
            .Include(sale => sale.Items)
            .Where(sale => sale.SaleDate >= from && sale.SaleDate <= to)
            .OrderByDescending(sale => sale.SaleDate)
            .ThenByDescending(sale => sale.CreatedAt)
            .ToListAsync();

        return new SaleListResponse([.. sales.Select(SaleDetail.From)], sales.Sum(sale => sale.Total));
    }
}
