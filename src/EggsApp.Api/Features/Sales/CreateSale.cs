using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Sales;

public static class CreateSale
{
    public static async Task<Outcome<SaleDetail>> HandleAsync(AppDbContext db, SaleFields fields)
    {
        if (await SaleCredit.CheckNewCustomerAsync(db, fields.CreditCustomerId) is { } problem)
        {
            return Outcome<SaleDetail>.Invalid(SaleCredit.CustomerField, problem);
        }

        var sale = new Sale
        {
            SaleDate = fields.Date,
            IsCredit = fields.CreditCustomerId is not null,
            CustomerId = fields.CreditCustomerId,
        };

        db.Sales.Add(sale);
        SaleLines.Add(db, sale, fields.Items);
        await db.SaveChangesAsync();

        return Outcome<SaleDetail>.Done(await SaleCredit.DescribeAsync(db, sale));
    }
}
