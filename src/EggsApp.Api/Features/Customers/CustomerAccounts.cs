using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Payments;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

/// <summary>Who a sale or an abono belongs to, as entries show it. A deleted customer still has a name here.</summary>
/// <param name="Phone">For lists that show it, like Ventas; null when they have none.</param>
public sealed record CustomerRef(Guid Id, string Name, bool IsDeleted, string? Phone = null);

/// <summary>What a customer owes in the one running account they have.</summary>
/// <param name="Credit">Their credit sales added up.</param>
/// <param name="Paid">Their abonos added up.</param>
public sealed record CustomerAccount(long Credit, long Paid)
{
    /// <summary>What they owe now. Never below zero: abonos and edits that would make it so are refused.</summary>
    public long Balance => Credit - Paid;
}

/// <summary>
/// A customer's balance is worked out from their credit sales and abonos every time, never stored, so it can't drift
/// from the entries it comes from.
/// </summary>
public static class CustomerAccounts
{
    public static async Task<CustomerAccount> ReadAsync(AppDbContext db, Guid customerId)
    {
        var credit = await db.Sales
            .Where(sale => sale.IsCredit && sale.CustomerId == customerId)
            .SumAsync(sale => sale.Total);

        var paid = await db.Payments
            .Where(payment => payment.CustomerId == customerId)
            .SumAsync(payment => payment.Amount);

        return new CustomerAccount(credit, paid);
    }

    /// <returns>The balance of every customer who has any credit sale or abono. Anyone missing owes nothing.</returns>
    public static async Task<Dictionary<Guid, long>> ReadAllBalancesAsync(AppDbContext db)
    {
        var credit = await db.Sales
            .Where(sale => sale.IsCredit)
            .GroupBy(sale => sale.CustomerId!.Value)
            .Select(group => new { CustomerId = group.Key, Total = group.Sum(sale => sale.Total) })
            .ToDictionaryAsync(row => row.CustomerId, row => row.Total);

        var paid = await db.Payments
            .GroupBy(payment => payment.CustomerId)
            .Select(group => new { CustomerId = group.Key, Total = group.Sum(payment => payment.Amount) })
            .ToDictionaryAsync(row => row.CustomerId, row => row.Total);

        return credit.Keys.Union(paid.Keys).ToDictionary(
            id => id,
            id => credit.GetValueOrDefault(id) - paid.GetValueOrDefault(id));
    }

    /// <summary>Names for entries, including customers who were deleted since.</summary>
    public static async Task<Dictionary<Guid, CustomerRef>> FindRefsAsync(AppDbContext db, IEnumerable<Guid> ids)
    {
        var wanted = ids.Distinct().ToList();

        if (wanted.Count == 0)
        {
            return [];
        }

        return await db.Customers
            .IgnoreQueryFilters([AppDbContext.SoftDeleteFilter])
            .AsNoTracking()
            .Where(customer => wanted.Contains(customer.Id))
            .Select(customer => new CustomerRef(customer.Id, customer.Name, customer.IsDeleted, customer.Phone))
            .ToDictionaryAsync(customer => customer.Id);
    }

    /// <summary>
    /// The 409 for a change to a credit sale that would leave its customer owing less than they've already paid.
    /// </summary>
    /// <param name="creditAfter">What their credit sales would add up to with the change.</param>
    /// <param name="change">The change, said as "con este cambio" or "sin esta venta".</param>
    public static string BelowZeroMessage(string name, long paid, long creditAfter, string change) =>
        $"{name} ya abonó {Colones.Format(paid)}, y {change} sus fiados sumarían {Colones.Format(creditAfter)}. " +
        $"Primero corrija o borre un abono de {name}.";
}
