using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Customers;

public static class FindSimilarCustomers
{
    private const int MaxResults = 3;

    /// <param name="db">The database.</param>
    /// <param name="name">The name being saved.</param>
    /// <param name="excludeId">The customer being edited, who shouldn't count as similar to themselves.</param>
    public static async Task<CustomerListResponse> HandleAsync(AppDbContext db, string? name, Guid? excludeId)
    {
        var wanted = CustomerNames.ForComparison(name ?? string.Empty);
        var customers = await ListCustomers.ReadAllAsync(db);

        var similar = customers
            .Where(customer => customer.Id != excludeId && CustomerNames.AreSimilar(customer.Name, wanted))
            .OrderByDescending(customer => CustomerNames.ForComparison(customer.Name) == wanted)
            .ThenBy(customer => customer.Name, CustomerNames.SpanishOrder)
            .Take(MaxResults)
            .ToList();

        return new CustomerListResponse(similar);
    }
}
