using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

public static class ListCustomers
{
    public static async Task<CustomerListResponse> HandleAsync(AppDbContext db, string? search)
    {
        var customers = await ReadAllAsync(db);

        var matches = customers
            .Where(customer => CustomerNames.MatchesSearch(customer.Name, search ?? string.Empty))
            .OrderBy(customer => customer.Name, CustomerNames.SpanishOrder)
            .ToList();

        return new CustomerListResponse(matches);
    }

    /// <summary>
    /// Every active customer. One family's customers are few enough to compare in memory on each request.
    /// </summary>
    internal static Task<List<CustomerSummary>> ReadAllAsync(AppDbContext db) =>
        db.Customers
            .AsNoTracking()
            .Select(customer => new CustomerSummary(customer.Id, customer.Name, customer.Phone))
            .ToListAsync();
}
