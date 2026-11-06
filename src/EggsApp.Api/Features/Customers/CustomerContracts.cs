namespace EggsApp.Api.Features.Customers;

/// <summary>What the UI sends to create or edit a customer.</summary>
public sealed record CustomerCommand(string? Name, string? Phone, string? Notes);

/// <summary>A command after cleaning: what gets validated and stored.</summary>
public sealed record CustomerFields(string Name, string? Phone, string? Notes);

// The responses are separate from the entity and made of objects, so a field like the balance can be added to them
// without changing what existing callers read.

/// <summary>A row of a customer list.</summary>
/// <param name="Balance">What they owe now; 0 if they're up to date.</param>
public sealed record CustomerSummary(Guid Id, string Name, string? Phone, long Balance);

/// <param name="OwedTotal">What all active customers owe together, whatever the search.</param>
public sealed record CustomerListResponse(IReadOnlyList<CustomerSummary> Items, long OwedTotal);

/// <param name="Balance">What they owe now; 0 if they're up to date.</param>
public sealed record CustomerDetail(Guid Id, string Name, string? Phone, string? Notes, long Balance = 0)
{
    public static CustomerDetail From(Customer customer, long balance) =>
        new(customer.Id, customer.Name, customer.Phone, customer.Notes, balance);
}
