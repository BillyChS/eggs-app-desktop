using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Sales;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

/// <summary>
/// A sale and the abonos that paid it, as SaleStatuses shares them out: the sale's own abonos and, for older fiados,
/// parts of the customer's other abonos. So they always add up to what the sale was paid, whatever paid it.
/// </summary>
public static class GetSalePayments
{
    /// <returns>Null if there's no active sale with that id. A cash sale has no abonos.</returns>
    public static async Task<SalePaymentsResponse?> HandleAsync(AppDbContext db, Guid saleId)
    {
        var sale = await db.Sales
            .AsNoTracking()
            .Include(candidate => candidate.Items)
            .FirstOrDefaultAsync(candidate => candidate.Id == saleId);

        if (sale is null)
        {
            return null;
        }

        var shares = sale.IsCredit
            ? await SaleStatuses.ReadSharesAsync(db, [sale.CustomerId!.Value])
            : new SaleShares([], []);

        var detail = SaleDetail.From(
            sale,
            await CustomerAccounts.FindRefsAsync(db, sale.CustomerId is { } id ? [id] : []),
            await SaleCredit.ReadPaidNowAsync(db, [sale.Id]),
            shares.Owed);

        var payments = shares.Shares.GetValueOrDefault(sale.Id) ?? [];

        return new SalePaymentsResponse(
            detail,
            payments.Sum(share => share.Applied),
            [
                .. payments
                    .OrderByDescending(share => share.Date)
                    .ThenByDescending(share => share.CreatedAt)
                    .ThenByDescending(share => share.PaymentId)
                    .Select(share => new SalePaymentShare(
                        share.PaymentId,
                        share.Date,
                        share.Applied,
                        share.Amount,
                        share.PaidWithSale)),
            ]);
    }
}
