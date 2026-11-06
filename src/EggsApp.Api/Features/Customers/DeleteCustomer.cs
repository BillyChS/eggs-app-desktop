using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

public enum DeleteCustomerOutcome
{
    Deleted,
    NotFound,
    Blocked,
}

/// <param name="Outcome">What happened.</param>
/// <param name="BlockedMessage">Why it was refused, in Spanish, when the outcome is Blocked.</param>
public sealed record DeleteCustomerResult(DeleteCustomerOutcome Outcome, string? BlockedMessage = null);

/// <summary>
/// A soft delete: the customer leaves every list and search, but the row stays, so past sales can still name them.
/// </summary>
public static class DeleteCustomer
{
    public static async Task<DeleteCustomerResult> HandleAsync(AppDbContext db, Guid id)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (customer is null)
        {
            return new DeleteCustomerResult(DeleteCustomerOutcome.NotFound);
        }

        var blocker = await FindBlockerAsync(db, customer);

        if (blocker is not null)
        {
            return new DeleteCustomerResult(DeleteCustomerOutcome.Blocked, blocker);
        }

        db.Customers.Remove(customer);
        await db.SaveChangesAsync();

        return new DeleteCustomerResult(DeleteCustomerOutcome.Deleted);
    }

    // Returns the Spanish message to show: the endpoint answers 409 with it, and the UI shows it as it is. Once
    // deleted, a customer's balance can't be seen anywhere, so only one who owes nothing can go. Their sales and
    // abonos stay, and can't be changed after (see SaleCredit and PaymentRules).
    private static async Task<string?> FindBlockerAsync(AppDbContext db, Customer customer)
    {
        var balance = (await CustomerAccounts.ReadAsync(db, customer.Id)).Balance;

        return balance > 0
            ? $"{customer.Name} todavía debe {Colones.Format(balance)}. Solo se puede borrar un cliente que esté al día."
            : null;
    }
}
