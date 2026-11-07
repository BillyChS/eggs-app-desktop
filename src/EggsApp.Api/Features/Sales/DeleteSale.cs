using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class DeleteSale
{
    /// <summary>
    /// Soft delete doesn't reach rows that aren't loaded, so the lines are loaded and deleted with the sale, and so is
    /// the abono paid when it was made. A credit sale's customer then owes that much less, which is refused if they've
    /// already paid more than the rest.
    /// </summary>
    public static async Task<Outcome<bool>> HandleAsync(AppDbContext db, Guid id)
    {
        var sale = await db.Sales.Include(candidate => candidate.Items).FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (sale is null)
        {
            return Outcome<bool>.NotFound();
        }

        var paidNow = await SaleCredit.FindPaidNowAsync(db, sale.Id);

        if (await SaleCredit.CheckChangeAsync(db, sale, paidNow, stillOwed: 0, stillPaid: 0, "sin esta venta") is { } refusal)
        {
            return Outcome<bool>.Refused(refusal);
        }

        db.SaleItems.RemoveRange(sale.Items);
        db.Sales.Remove(sale);

        if (paidNow is not null)
        {
            db.Payments.Remove(paidNow);
        }

        await db.SaveChangesAsync();

        return Outcome<bool>.Done(true);
    }
}
