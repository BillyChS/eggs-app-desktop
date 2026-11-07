using EggsApp.Api.Data;
using EggsApp.Api.Features.Sales;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

/// <summary>One line of a customer's account: a credit sale, which adds to what they owe, or an abono, which lowers it.</summary>
/// <param name="Kind">"sale" or "payment".</param>
/// <param name="Amount">Always positive. The kind says which way it moves the balance.</param>
/// <param name="Balance">What the customer owed right after this entry.</param>
/// <param name="Note">An abono's note.</param>
/// <param name="Items">A sale's lines.</param>
/// <param name="SaleId">For an abono paid as a credit sale was made: that sale.</param>
public sealed record StatementEntry(
    string Kind,
    Guid Id,
    DateOnly Date,
    long Amount,
    long Balance,
    string? Note,
    IReadOnlyList<SaleItemDetail>? Items,
    Guid? SaleId = null);

/// <summary>A cash sale this customer was named on. Paid on the spot: it's never part of the account.</summary>
public sealed record CashPurchase(Guid Id, DateOnly Date, long Total, IReadOnlyList<SaleItemDetail> Items);

/// <param name="Entries">Newest first, so the top entry's balance is the balance now.</param>
/// <param name="CashPurchases">Newest first. Kept apart from the entries, which add up to the balance.</param>
public sealed record CustomerStatement(
    Guid Id,
    string Name,
    string? Phone,
    long Balance,
    IReadOnlyList<StatementEntry> Entries,
    IReadOnlyList<CashPurchase> CashPurchases);

public static class GetStatement
{
    public const string SaleKind = "sale";
    public const string PaymentKind = "payment";

    /// <returns>The account, or null if there's no active customer with that id.</returns>
    public static async Task<CustomerStatement?> HandleAsync(AppDbContext db, Guid id)
    {
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (customer is null)
        {
            return null;
        }

        var allSales = await db.Sales
            .AsNoTracking()
            .Include(sale => sale.Items)
            .Where(sale => sale.CustomerId == id)
            .ToListAsync();

        var sales = allSales.Where(sale => sale.IsCredit);

        var cashPurchases = allSales
            .Where(sale => !sale.IsCredit)
            .OrderByDescending(sale => sale.SaleDate)
            .ThenByDescending(sale => sale.CreatedAt)
            .Select(sale => new CashPurchase(sale.Id, sale.SaleDate, sale.Total, SaleItemDetail.ListFrom(sale)))
            .ToList();

        var payments = await db.Payments.AsNoTracking().Where(payment => payment.CustomerId == id).ToListAsync();

        var happened = sales
            .Select(sale => new Happened(
                new StatementEntry(SaleKind, sale.Id, sale.SaleDate, sale.Total, 0, null, SaleItemDetail.ListFrom(sale)),
                sale.CreatedAt,
                sale.Total))
            .Concat(payments.Select(payment => new Happened(
                new StatementEntry(
                    PaymentKind,
                    payment.Id,
                    payment.PaymentDate,
                    payment.Amount,
                    0,
                    payment.Note,
                    null,
                    payment.SaleId),
                payment.CreatedAt,
                -payment.Amount)))
            // By day, then by when they were entered, which is the order they happened in within a day.
            .OrderBy(item => item.Entry.Date)
            .ThenBy(item => item.EnteredAt);

        var balance = 0L;
        var entries = new List<StatementEntry>();

        foreach (var item in happened)
        {
            balance += item.Change;
            entries.Add(item.Entry with { Balance = balance });
        }

        entries.Reverse();

        return new CustomerStatement(customer.Id, customer.Name, customer.Phone, balance, entries, cashPurchases);
    }

    private sealed record Happened(StatementEntry Entry, DateTime EnteredAt, long Change);
}
