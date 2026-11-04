using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

public static class GetCustomer
{
    /// <returns>The customer, or null if there's no active customer with that id.</returns>
    public static async Task<CustomerDetail?> HandleAsync(AppDbContext db, Guid id)
    {
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == id);

        return customer is null ? null : CustomerDetail.From(customer);
    }
}
