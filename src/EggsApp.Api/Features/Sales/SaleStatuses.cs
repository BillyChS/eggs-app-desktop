using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

/// <summary>
/// What each credit sale still owes, for "Debe ₡X" or "Pagado con abonos". Abonos aren't tied to sales (apart from the
/// one paid as a sale was made), so they're shared out here: each customer's linked abono pays its own sale first, and
/// all their other abonos then pay their oldest credit sales first (by sale date, then by when it was entered).
/// Worked out on every read and never stored, so what the sales owe always adds up to the customer's balance.
/// </summary>
internal static class SaleStatuses
{
    /// <returns>
    /// What every credit sale of these customers still owes, by sale, from all their history rather than a period.
    /// Cash sales aren't there: they owe nothing.
    /// </returns>
    public static async Task<Dictionary<Guid, long>> ReadOwedAsync(AppDbContext db, IEnumerable<Guid> customerIds)
    {
        var wanted = customerIds.Distinct().ToList();

        if (wanted.Count == 0)
        {
            return [];
        }

        var sales = await db.Sales
            .AsNoTracking()
            .Where(sale => sale.IsCredit && sale.CustomerId != null && wanted.Contains(sale.CustomerId.Value))
            .Select(sale => new CreditSale(sale.Id, sale.CustomerId!.Value, sale.SaleDate, sale.CreatedAt, sale.Total))
            .ToListAsync();

        var payments = await db.Payments
            .AsNoTracking()
            .Where(payment => wanted.Contains(payment.CustomerId))
            .Select(payment => new Abono(payment.CustomerId, payment.SaleId, payment.Amount))
            .ToListAsync();

        var owed = new Dictionary<Guid, long>();

        foreach (var customerSales in sales.GroupBy(sale => sale.CustomerId))
        {
            Share(customerSales, payments.Where(payment => payment.CustomerId == customerSales.Key), owed);
        }

        return owed;
    }

    private static void Share(IEnumerable<CreditSale> sales, IEnumerable<Abono> abonos, Dictionary<Guid, long> owed)
    {
        // Id last, so two sales entered in the same instant always come out in the same order.
        var oldestFirst = sales.OrderBy(sale => sale.Date).ThenBy(sale => sale.CreatedAt).ThenBy(sale => sale.Id).ToList();

        foreach (var sale in oldestFirst)
        {
            owed[sale.Id] = sale.Total;
        }

        long pool = 0;

        foreach (var abono in abonos)
        {
            // A linked abono is always less than its sale, so it never has anything left over for the others.
            if (abono.SaleId is { } saleId && owed.TryGetValue(saleId, out var left))
            {
                var applied = Math.Min(left, abono.Amount);
                owed[saleId] = left - applied;
                pool += abono.Amount - applied;
            }
            else
            {
                pool += abono.Amount;
            }
        }

        foreach (var sale in oldestFirst)
        {
            if (pool == 0)
            {
                break;
            }

            var applied = Math.Min(owed[sale.Id], pool);
            owed[sale.Id] -= applied;
            pool -= applied;
        }
    }

    private sealed record CreditSale(Guid Id, Guid CustomerId, DateOnly Date, DateTime CreatedAt, long Total);

    private sealed record Abono(Guid CustomerId, Guid? SaleId, long Amount);
}
