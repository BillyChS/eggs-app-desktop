using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class UpdateSale
{
    /// <summary>
    /// The sale keeps its id and gets a whole new set of lines. The old ones stay, soft-deleted. Abonos aren't tied to
    /// sales, so a change to a credit sale simply changes the balance from then on (see SaleCredit).
    /// </summary>
    public static async Task<Outcome<SaleDetail>> HandleAsync(AppDbContext db, Guid id, SaleFields fields)
    {
        var sale = await db.Sales.Include(candidate => candidate.Items).FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (sale is null)
        {
            return Outcome<SaleDetail>.NotFound();
        }

        var newTotal = fields.Items.Sum(item => item.Quantity * item.UnitPrice);
        var stillOwed = fields.CreditCustomerId is { } newCustomer && newCustomer == sale.CustomerId ? newTotal : 0;

        if (await SaleCredit.CheckChangeAsync(db, sale, stillOwed, "con este cambio") is { } refusal)
        {
            return Outcome<SaleDetail>.Refused(refusal);
        }

        if (fields.CreditCustomerId != sale.CustomerId
            && await SaleCredit.CheckNewCustomerAsync(db, fields.CreditCustomerId) is { } problem)
        {
            return Outcome<SaleDetail>.Invalid(SaleCredit.CustomerField, problem);
        }

        db.SaleItems.RemoveRange(sale.Items);
        SaleLines.Add(db, sale, fields.Items);
        sale.SaleDate = fields.Date;
        sale.IsCredit = fields.CreditCustomerId is not null;
        sale.CustomerId = fields.CreditCustomerId;

        // Marked by hand: a new set of lines with the same date and total wouldn't otherwise touch UpdatedAt.
        db.Entry(sale).State = EntityState.Modified;
        await db.SaveChangesAsync();

        return Outcome<SaleDetail>.Done(await SaleCredit.DescribeAsync(db, sale));
    }
}
