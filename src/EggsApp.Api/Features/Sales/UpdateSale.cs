using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class UpdateSale
{
    /// <summary>
    /// The sale keeps its id and gets a whole new set of lines. The old ones stay, soft-deleted. Other abonos aren't
    /// tied to sales, so a change to a credit sale simply changes the balance from then on (see SaleCredit). The abono
    /// paid when the sale was made follows it, in the same SaveChanges.
    /// </summary>
    public static async Task<Outcome<SaleDetail>> HandleAsync(AppDbContext db, Guid id, SaleFields fields)
    {
        var sale = await db.Sales.Include(candidate => candidate.Items).FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (sale is null)
        {
            return Outcome<SaleDetail>.NotFound();
        }

        var paidNow = await SaleCredit.FindPaidNowAsync(db, sale.Id);
        var sameCreditCustomer = fields.IsCredit && fields.CustomerId == sale.CustomerId;

        if (await SaleCredit.CheckChangeAsync(
                db,
                sale,
                paidNow,
                stillOwed: sameCreditCustomer ? fields.Total : 0,
                stillPaid: sameCreditCustomer ? fields.PaidNow : 0,
                "con este cambio") is { } refusal)
        {
            return Outcome<SaleDetail>.Refused(refusal);
        }

        // A cash sale may keep a buyer who was deleted since, but nothing new can go to them, not even a fiado.
        var becomesNewFor = fields.CustomerId != sale.CustomerId || (fields.IsCredit && !sale.IsCredit);

        if (becomesNewFor && await SaleCredit.CheckNewCustomerAsync(db, fields.CustomerId) is { } problem)
        {
            return Outcome<SaleDetail>.Invalid(SaleCredit.CustomerField, problem);
        }

        db.SaleItems.RemoveRange(sale.Items);
        SaleLines.Add(db, sale, fields.Items);
        sale.SaleDate = fields.Date;
        sale.IsCredit = fields.IsCredit;
        sale.CustomerId = fields.CustomerId;
        SaleCredit.ApplyPaidNow(db, sale, paidNow, fields.PaidNow);

        // Marked by hand: a new set of lines with the same date and total wouldn't otherwise touch UpdatedAt.
        db.Entry(sale).State = EntityState.Modified;
        await db.SaveChangesAsync();

        return Outcome<SaleDetail>.Done(await SaleCredit.DescribeAsync(db, sale));
    }
}
