using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

/// <summary>Part of one abono that went to one credit sale.</summary>
/// <param name="PaymentId">The abono.</param>
/// <param name="Date">The day the abono was paid.</param>
/// <param name="Applied">What of it went to this sale.</param>
/// <param name="Amount">The whole abono, which can be more when the rest went to the customer's other fiados.</param>
/// <param name="PaidWithSale">Paid as the sale was made ("¿Pagó algo ahora?").</param>
internal sealed record AbonoShare(
    Guid PaymentId,
    DateOnly Date,
    DateTime CreatedAt,
    long Applied,
    long Amount,
    bool PaidWithSale);

/// <param name="Owed">What every credit sale still owes, by sale.</param>
/// <param name="Shares">Which abonos paid each credit sale, and how much of each, by sale.</param>
internal sealed record SaleShares(Dictionary<Guid, long> Owed, Dictionary<Guid, List<AbonoShare>> Shares);

/// <summary>
/// What each credit sale still owes, for "Debe ₡X" or "Pagado con abonos", and which abonos paid it. An abono can
/// point at a sale: the one paid as the sale was made (Payment.SaleId) or one paid from the sale's Abonar button
/// (Payment.ForSaleId). Each customer's abonos that point at one of their active credit sales pay that sale first.
/// Everything else, and whatever didn't fit in the sale it pointed at, pays their oldest credit sales first (by sale
/// date, then by when it was entered). Worked out on every read and never stored, so what the sales owe always adds up
/// to the customer's balance.
/// </summary>
internal static class SaleStatuses
{
    /// <returns>
    /// What every credit sale of these customers still owes, by sale, from all their history rather than a period.
    /// Cash sales aren't there: they owe nothing.
    /// </returns>
    public static async Task<Dictionary<Guid, long>> ReadOwedAsync(AppDbContext db, IEnumerable<Guid> customerIds) =>
        (await ReadSharesAsync(db, customerIds)).Owed;

    /// <returns>What every credit sale of these customers still owes, and which abonos paid it.</returns>
    public static async Task<SaleShares> ReadSharesAsync(AppDbContext db, IEnumerable<Guid> customerIds)
    {
        var wanted = customerIds.Distinct().ToList();
        var result = new SaleShares([], []);

        if (wanted.Count == 0)
        {
            return result;
        }

        // The query filter leaves deleted sales out, so an abono pointing at one goes to the customer's other fiados.
        var sales = await db.Sales
            .AsNoTracking()
            .Where(sale => sale.IsCredit && sale.CustomerId != null && wanted.Contains(sale.CustomerId.Value))
            .Select(sale => new CreditSale(sale.Id, sale.CustomerId!.Value, sale.SaleDate, sale.CreatedAt, sale.Total))
            .ToListAsync();

        var payments = await db.Payments
            .AsNoTracking()
            .Where(payment => wanted.Contains(payment.CustomerId))
            .Select(payment => new Abono(
                payment.Id,
                payment.CustomerId,
                payment.PaymentDate,
                payment.CreatedAt,
                payment.Amount,
                payment.SaleId,
                payment.ForSaleId))
            .ToListAsync();

        var paymentsByCustomer = payments.ToLookup(payment => payment.CustomerId);

        foreach (var customerSales in sales.GroupBy(sale => sale.CustomerId))
        {
            Share(customerSales, paymentsByCustomer[customerSales.Key], result);
        }

        return result;
    }

    private static void Share(IEnumerable<CreditSale> sales, IEnumerable<Abono> abonos, SaleShares result)
    {
        // Id last, so two entries made in the same instant always come out in the same order.
        var oldestSales = sales.OrderBy(sale => sale.Date).ThenBy(sale => sale.CreatedAt).ThenBy(sale => sale.Id).ToList();
        var oldestAbonos = abonos.OrderBy(abono => abono.Date).ThenBy(abono => abono.CreatedAt).ThenBy(abono => abono.Id);

        // Only this customer's sales: an abono pointing at a sale that moved to someone else stays with who paid it.
        var owed = oldestSales.ToDictionary(sale => sale.Id, sale => sale.Total);

        foreach (var sale in oldestSales)
        {
            result.Shares[sale.Id] = [];
        }

        // What's left of each abono after the sale it points at, in the order they were paid.
        var pool = new List<(Abono Abono, long Left)>();

        // The one paid with the sale goes first: it was paid on the day the sale was made.
        foreach (var abono in oldestAbonos.OrderBy(abono => abono.SaleId is null))
        {
            var target = abono.SaleId ?? abono.ForSaleId;
            long applied = 0;

            if (target is { } saleId && owed.TryGetValue(saleId, out var left))
            {
                applied = Math.Min(left, abono.Amount);
                owed[saleId] = left - applied;
                AddShare(result, saleId, abono, applied);
            }

            if (abono.Amount > applied)
            {
                pool.Add((abono, abono.Amount - applied));
            }
        }

        var oldestPool = pool
            .OrderBy(entry => entry.Abono.Date)
            .ThenBy(entry => entry.Abono.CreatedAt)
            .ThenBy(entry => entry.Abono.Id)
            .ToList();
        var next = 0;

        foreach (var sale in oldestSales)
        {
            while (owed[sale.Id] > 0 && next < oldestPool.Count)
            {
                var (abono, left) = oldestPool[next];
                var applied = Math.Min(owed[sale.Id], left);
                owed[sale.Id] -= applied;
                AddShare(result, sale.Id, abono, applied);

                if (applied == left)
                {
                    next++;
                }
                else
                {
                    oldestPool[next] = (abono, left - applied);
                }
            }
        }

        foreach (var (saleId, left) in owed)
        {
            result.Owed[saleId] = left;
        }
    }

    private static void AddShare(SaleShares result, Guid saleId, Abono abono, long applied)
    {
        if (applied > 0)
        {
            result.Shares[saleId].Add(
                new AbonoShare(abono.Id, abono.Date, abono.CreatedAt, applied, abono.Amount, abono.SaleId == saleId));
        }
    }

    private sealed record CreditSale(Guid Id, Guid CustomerId, DateOnly Date, DateTime CreatedAt, long Total);

    private sealed record Abono(
        Guid Id,
        Guid CustomerId,
        DateOnly Date,
        DateTime CreatedAt,
        long Amount,
        Guid? SaleId,
        Guid? ForSaleId);
}
