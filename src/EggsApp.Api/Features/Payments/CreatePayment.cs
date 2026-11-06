using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;

namespace EggsApp.Api.Features.Payments;

public static class CreatePayment
{
    /// <returns>Not found if there's no active customer with that id.</returns>
    public static async Task<Outcome<PaymentDetail>> HandleAsync(AppDbContext db, Guid customerId, PaymentFields fields)
    {
        var customers = await CustomerAccounts.FindRefsAsync(db, [customerId]);

        if (!customers.TryGetValue(customerId, out var customer) || customer.IsDeleted)
        {
            return Outcome<PaymentDetail>.NotFound();
        }

        if (await PaymentRules.CheckAmountAsync(db, customer, fields.Amount, replacing: null) is { } problem)
        {
            return Outcome<PaymentDetail>.Invalid(PaymentRules.AmountField, problem);
        }

        var payment = new Payment
        {
            CustomerId = customerId,
            PaymentDate = fields.Date,
            Amount = fields.Amount,
            Note = fields.Note,
        };

        db.Payments.Add(payment);
        await db.SaveChangesAsync();

        return Outcome<PaymentDetail>.Done(PaymentDetail.From(payment, customers));
    }
}
