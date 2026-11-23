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

        // For "Abono a la venta del …": only sales still there, so a deleted one's abono reads as a plain abono.
        var saleIds = payments.Where(payment => payment.ForSaleId != null).Select(payment => payment.ForSaleId!.Value).Distinct().ToList();
        var saleDates = saleIds.Count == 0
            ? []
            : await db.Sales
                .AsNoTracking()
                .Where(sale => saleIds.Contains(sale.Id))
                .ToDictionaryAsync(sale => sale.Id, sale => sale.SaleDate);

        return new PaymentListResponse(
            [.. payments.Select(payment => PaymentDetail.From(payment, customers, saleDates))],
            payments.Sum(payment => payment.Amount));
    }
}
