using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

public static class ListPayments
{
    /// <returns>The abonos paid from one date to another, both included, newest first, and what they add up to.</returns>
    public static async Task<PaymentListResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var payments = await db.Payments
            .AsNoTracking()
            .Where(payment => payment.PaymentDate >= from && payment.PaymentDate <= to)
            .OrderByDescending(payment => payment.PaymentDate)
            .ThenByDescending(payment => payment.CreatedAt)
            .ToListAsync();

        var customers = await CustomerAccounts.FindRefsAsync(db, payments.Select(payment => payment.CustomerId));

        return new PaymentListResponse(
            [.. payments.Select(payment => PaymentDetail.From(payment, customers))],
            payments.Sum(payment => payment.Amount));
    }
}
