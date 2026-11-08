using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Sales;

public static class CreateSale
{
    /// <summary>
    /// The sale, its lines and the abono paid when it was made (if any) are written by one SaveChanges, which is one
    /// transaction: all or nothing. So is a new customer added with it.
    /// </summary>
    public static async Task<Outcome<SaleDetail>> HandleAsync(AppDbContext db, SaleFields fields)
    {
        if (await SaleCredit.CheckNewCustomerAsync(db, fields.CustomerId) is { } problem)
        {
            return Outcome<SaleDetail>.Invalid(SaleCredit.CustomerField, problem);
        }

        var sale = new Sale
        {
            SaleDate = fields.Date,
            IsCredit = fields.IsCredit,
            CustomerId = SaleCredit.ResolveCustomer(db, fields),
        };

        db.Sales.Add(sale);
        SaleLines.Add(db, sale, fields.Items);
        SaleCredit.ApplyPaidNow(db, sale, current: null, fields.PaidNow);
        await db.SaveChangesAsync();

        return Outcome<SaleDetail>.Done(await SaleCredit.DescribeAsync(db, sale));
    }
}
