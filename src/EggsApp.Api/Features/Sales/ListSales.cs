using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class ListSales
{
    /// <returns>
    /// The sales from one date to another, both included, newest first. Income is cash-basis: only the cash sales add
    /// up to it, and the credit sales are totaled apart, as money owed.
    /// </returns>
    public static async Task<SaleListResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var sales = await db.Sales
            .AsNoTracking()
            .Include(sale => sale.Items)
            .Where(sale => sale.SaleDate >= from && sale.SaleDate <= to)
            .OrderByDescending(sale => sale.SaleDate)
            .ThenByDescending(sale => sale.CreatedAt)
            .ToListAsync();

        var customers = await CustomerAccounts.FindRefsAsync(
            db,
            sales.Where(sale => sale.CustomerId is not null).Select(sale => sale.CustomerId!.Value));

        var paidNow = await SaleCredit.ReadPaidNowAsync(db, sales.Where(sale => sale.IsCredit).Select(sale => sale.Id));

        return new SaleListResponse(
            [.. sales.Select(sale => SaleDetail.From(sale, customers, paidNow))],
            CashTotal: sales.Where(sale => !sale.IsCredit).Sum(sale => sale.Total),
            CreditTotal: sales.Where(sale => sale.IsCredit).Sum(sale => sale.Total));
    }
}
