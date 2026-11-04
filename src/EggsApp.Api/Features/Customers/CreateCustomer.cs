using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Customers;

public static class CreateCustomer
{
    public static async Task<CustomerDetail> HandleAsync(AppDbContext db, CustomerFields fields)
    {
        var customer = new Customer { Name = fields.Name, Phone = fields.Phone, Notes = fields.Notes };

        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        return CustomerDetail.From(customer);
    }
}
