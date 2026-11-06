using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

public static class DeletePayment
{
    /// <summary>A soft delete. The customer owes that much again, which is always allowed.</summary>
    public static async Task<Outcome<bool>> HandleAsync(AppDbContext db, Guid id)
    {
        var payment = await db.Payments.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (payment is null)
        {
            return Outcome<bool>.NotFound();
        }

        var customer = (await CustomerAccounts.FindRefsAsync(db, [payment.CustomerId]))[payment.CustomerId];

        if (customer.IsDeleted)
        {
            return Outcome<bool>.Refused(PaymentRules.DeletedCustomerMessage(customer));
        }

        db.Payments.Remove(payment);
        await db.SaveChangesAsync();

        return Outcome<bool>.Done(true);
    }
}
