using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

public static class UpdatePayment
{
    /// <summary>The date, amount and note can change; the customer can't.</summary>
    public static async Task<Outcome<PaymentDetail>> HandleAsync(AppDbContext db, Guid id, PaymentFields fields)
    {
        var payment = await db.Payments.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (payment is null)
        {
            return Outcome<PaymentDetail>.NotFound();
        }

        var customers = await CustomerAccounts.FindRefsAsync(db, [payment.CustomerId]);
        var customer = customers[payment.CustomerId];

        if (customer.IsDeleted)
        {
            return Outcome<PaymentDetail>.Refused(PaymentRules.DeletedCustomerMessage(customer));
        }

        if (await PaymentRules.CheckAmountAsync(db, customer, fields.Amount, replacing: payment) is { } problem)
        {
            return Outcome<PaymentDetail>.Invalid(PaymentRules.AmountField, problem);
        }

        payment.PaymentDate = fields.Date;
        payment.Amount = fields.Amount;
        payment.Note = fields.Note;
        await db.SaveChangesAsync();

        return Outcome<PaymentDetail>.Done(PaymentDetail.From(payment, customers));
    }
}
