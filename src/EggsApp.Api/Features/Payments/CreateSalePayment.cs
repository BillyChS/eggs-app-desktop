using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Sales;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Payments;

/// <summary>An abono from a credit sale's Abonar button: paid today, toward that sale first (Payment.ForSaleId).</summary>
public static class CreateSalePayment
{
    public const string CashSaleMessage = "Esta venta fue al contado, así que no tiene nada que abonar.";

    public const string PaidOffMessage = "Esta venta ya está pagada.";

    public static string TooMuchMessage(long owed) =>
        $"El abono no puede ser mayor a lo que debe ({Colones.Format(owed)}).";

    /// <returns>
    /// Not found if there's no active sale with that id; refused for a cash sale or a deleted customer's; invalid if
    /// the amount is more than the sale still owes.
    /// </returns>
    public static async Task<Outcome<PaymentDetail>> HandleAsync(AppDbContext db, Guid saleId, long amount)
    {
        var sale = await db.Sales.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == saleId);

        if (sale is null)
        {
            return Outcome<PaymentDetail>.NotFound();
        }

        if (!sale.IsCredit || sale.CustomerId is not { } customerId)
        {
            return Outcome<PaymentDetail>.Refused(CashSaleMessage);
        }

        var customers = await CustomerAccounts.FindRefsAsync(db, [customerId]);
        var customer = customers[customerId];

        if (customer.IsDeleted)
        {
            return Outcome<PaymentDetail>.Refused(
                $"Esta venta es de {customer.Name}, un cliente que se borró, así que ya no se le puede abonar.");
        }

        // What the sales owe adds up to the balance, so an abono that fits in the sale always fits in the balance too.
        var owed = (await SaleStatuses.ReadOwedAsync(db, [customerId])).GetValueOrDefault(sale.Id);

        if (amount > owed)
        {
            return Outcome<PaymentDetail>.Invalid(
                PaymentRules.AmountField,
                owed == 0 ? PaidOffMessage : TooMuchMessage(owed));
        }

        var payment = new Payment
        {
            CustomerId = customerId,
            PaymentDate = DateOnly.FromDateTime(DateTime.Now),
            Amount = amount,
            ForSaleId = sale.Id,
        };

        db.Payments.Add(payment);
        await db.SaveChangesAsync();

        return Outcome<PaymentDetail>.Done(
            PaymentDetail.From(payment, customers, new Dictionary<Guid, DateOnly> { [sale.Id] = sale.SaleDate }));
    }
}
