namespace EggsApp.Api.Features.Customers;

/// <summary>What the UI sends to create or edit a customer.</summary>
public sealed record CustomerCommand(string? Name, string? Phone, string? Notes);

/// <summary>A command after cleaning: what gets validated and stored.</summary>
public sealed record CustomerFields(string Name, string? Phone, string? Notes);

// The responses are separate from the entity and made of objects, so a field like the balance can be added to them
// without changing what existing callers read.

/// <summary>A row of a customer list.</summary>
public sealed record CustomerSummary(Guid Id, string Name, string? Phone);

public sealed record CustomerListResponse(IReadOnlyList<CustomerSummary> Items);

public sealed record CustomerDetail(Guid Id, string Name, string? Phone, string? Notes)
{
    public static CustomerDetail From(Customer customer) =>
        new(customer.Id, customer.Name, customer.Phone, customer.Notes);
}

/// <summary>Why something was refused, in Spanish, to show as it is.</summary>
public sealed record CustomerRefusal(string Message);
