using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Customers;

public static class UpdateCustomer
{
    /// <returns>The customer as saved, or null if there's no active customer with that id.</returns>
    public static async Task<CustomerDetail?> HandleAsync(AppDbContext db, Guid id, CustomerFields fields)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (customer is null)
        {
            return null;
        }

        customer.Name = fields.Name;
        customer.Phone = fields.Phone;
        customer.Notes = fields.Notes;
        await db.SaveChangesAsync();

        return CustomerDetail.From(customer);
    }
}
