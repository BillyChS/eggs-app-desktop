using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

public static class GetPayment
{
    /// <returns>The abono, or null if there's no active abono with that id.</returns>
    public static async Task<PaymentDetail?> HandleAsync(AppDbContext db, Guid id)
    {
        var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == id);

        return payment is null
            ? null
            : PaymentDetail.From(payment, await CustomerAccounts.FindRefsAsync(db, [payment.CustomerId]));
    }
}
