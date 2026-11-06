using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

/// <summary>The rules that keep customers' balances right while their credit sales are created, edited and deleted.</summary>
internal static class SaleCredit
{
    public const string CustomerField = "customerId";

    /// <returns>A Spanish message for the customer field, or null if a new credit sale can go to this customer.</returns>
    public static async Task<string?> CheckNewCustomerAsync(AppDbContext db, Guid? customerId) =>
        customerId is { } id && !await db.Customers.AnyAsync(customer => customer.Id == id)
            ? "Ese cliente ya no existe. Escoja otro."
            : null;

    /// <summary>
    /// A credit sale may change, move to another customer, become a cash sale or be deleted, but not leave its
    /// customer owing less than they've already paid: their abonos would then pay for nothing. A deleted customer's
    /// sales don't change at all, because nobody could see the balance they'd move.
    /// </summary>
    /// <param name="sale">The sale as it is now.</param>
    /// <param name="stillOwed">What the sale's current customer would still owe for it after the change.</param>
    /// <param name="change">The change, said as "con este cambio" or "sin esta venta".</param>
    /// <returns>Why the change is refused, in Spanish, or null if it can go ahead.</returns>
    public static async Task<string?> CheckChangeAsync(AppDbContext db, Sale sale, long stillOwed, string change)
    {
        if (sale.CustomerId is not { } customerId)
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

        return creditAfter < account.Paid
            ? CustomerAccounts.BelowZeroMessage(customer.Name, account.Paid, creditAfter, change)
            : null;
    }

    public static async Task<SaleDetail> DescribeAsync(AppDbContext db, Sale sale) =>
        SaleDetail.From(sale, await CustomerAccounts.FindRefsAsync(db, sale.CustomerId is { } id ? [id] : []));
}
