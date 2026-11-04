using EggsApp.Api.Data;
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

        var blocker = await FindBlockerAsync();

        if (blocker is not null)
        {
            return new DeleteCustomerResult(DeleteCustomerOutcome.Blocked, blocker);
        }

        db.Customers.Remove(customer);
        await db.SaveChangesAsync();

        return new DeleteCustomerResult(DeleteCustomerOutcome.Deleted);
    }

    // The rule for a pending balance goes here, once credit sales exist. Return the Spanish message to show: the
    // endpoint answers 409 with it, and the UI shows it as it is.
    private static Task<string?> FindBlockerAsync() => Task.FromResult<string?>(null);
}
