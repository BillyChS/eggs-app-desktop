using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Payments;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

/// <summary>
/// The rules that keep customers' balances right while their credit sales, and the abonos paid when they were made,
/// are created, edited and deleted. A cash sale's customer is only who bought it: no rule here applies to it.
/// </summary>
internal static class SaleCredit
{
    public const string CustomerField = "customerId";

    /// <returns>A Spanish message for the customer field, or null if a sale can go to this customer now.</returns>
    public static async Task<string?> CheckNewCustomerAsync(AppDbContext db, Guid? customerId) =>
        customerId is { } id && !await db.Customers.AnyAsync(customer => customer.Id == id)
            ? "Ese cliente ya no existe. Escoja otro."
            : null;

    /// <summary>
    /// A credit sale may change, move to another customer, become a cash sale or be deleted, but not leave its
    /// customer owing less than they've already paid: their abonos would then pay for nothing. A deleted customer's
    /// credit sales don't change at all, because nobody could see the balance they'd move. A cash sale moves no
    /// balance, so it can always change, even after its buyer was deleted.
    /// </summary>
    /// <param name="sale">The sale as it is now.</param>
    /// <param name="paidNow">The abono tied to the sale as it is now, if any.</param>
    /// <param name="stillOwed">What the sale's current customer would still owe for it after the change.</param>
    /// <param name="stillPaid">What the current customer's abono tied to the sale would be after the change.</param>
    /// <param name="change">The change, said as "con este cambio" or "sin esta venta".</param>
    /// <returns>Why the change is refused, in Spanish, or null if it can go ahead.</returns>
    public static async Task<string?> CheckChangeAsync(
        AppDbContext db,
        Sale sale,
        Payment? paidNow,
        long stillOwed,
        long stillPaid,
        string change)
    {
        if (!sale.IsCredit || sale.CustomerId is not { } customerId)
        {
            return null;
        }

        var customer = (await CustomerAccounts.FindRefsAsync(db, [customerId]))[customerId];

        if (customer.IsDeleted)
        {
            return $"Esta venta es de {customer.Name}, un cliente que se borró, así que ya no se puede cambiar.";
        }

        var account = await CustomerAccounts.ReadAsync(db, customerId);
        var creditAfter = account.Credit - sale.Total + stillOwed;
        var paidAfter = account.Paid - (paidNow?.Amount ?? 0) + stillPaid;

        return creditAfter < paidAfter
            ? CustomerAccounts.BelowZeroMessage(customer.Name, paidAfter, creditAfter, change)
            : null;
    }

    public static Task<Payment?> FindPaidNowAsync(AppDbContext db, Guid saleId) =>
        db.Payments.FirstOrDefaultAsync(payment => payment.SaleId == saleId);

    /// <returns>The abono paid when each sale was made, by sale. Sales without one are missing.</returns>
    public static async Task<Dictionary<Guid, long>> ReadPaidNowAsync(AppDbContext db, IEnumerable<Guid> saleIds)
    {
        var wanted = saleIds.ToList();

        if (wanted.Count == 0)
        {
            return [];
        }

        return await db.Payments
            .AsNoTracking()
            .Where(payment => payment.SaleId != null && wanted.Contains(payment.SaleId.Value))
            .ToDictionaryAsync(payment => payment.SaleId!.Value, payment => payment.Amount);
    }

    /// <summary>
    /// Makes the abono tied to the sale match it: none for 0, and otherwise the sale's customer, date and that amount.
    /// An abono never changes customer, so a sale moved to someone else gets a new one and the old one is deleted.
    /// Saved with the sale, in the same SaveChanges, so both or neither are written.
    /// </summary>
    /// <param name="sale">The sale with its new customer and date.</param>
    /// <param name="current">The abono tied to the sale now, if any.</param>
    public static void ApplyPaidNow(AppDbContext db, Sale sale, Payment? current, long amount)
    {
        if (amount == 0 || sale.CustomerId is not { } customerId)
        {
            if (current is not null)
            {
                db.Payments.Remove(current);
            }

            return;
        }

        if (current is not null && current.CustomerId == customerId)
        {
            current.Amount = amount;
            current.PaymentDate = sale.SaleDate;
            return;
        }

        if (current is not null)
        {
            db.Payments.Remove(current);
        }

        db.Payments.Add(new Payment
        {
            CustomerId = customerId,
            PaymentDate = sale.SaleDate,
            Amount = amount,
            SaleId = sale.Id,
        });
    }

    public static async Task<SaleDetail> DescribeAsync(AppDbContext db, Sale sale) =>
        SaleDetail.From(
            sale,
            await CustomerAccounts.FindRefsAsync(db, sale.CustomerId is { } id ? [id] : []),
            await ReadPaidNowAsync(db, [sale.Id]));
}
