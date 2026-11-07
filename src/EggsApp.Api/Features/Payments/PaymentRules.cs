using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using EggsApp.Api.Features.Customers;

namespace EggsApp.Api.Features.Payments;

/// <summary>What keeps abonos from making a balance go below zero, which would mean money owed back to the customer.</summary>
internal static class PaymentRules
{
    public const string AmountField = "amount";

    /// <param name="customer">Who pays.</param>
    /// <param name="replacing">The abono being edited, whose amount counts as not paid yet; null for a new one.</param>
    /// <returns>A Spanish message for the amount, or null if the customer owes at least that much.</returns>
    public static async Task<string?> CheckAmountAsync(
        AppDbContext db,
        CustomerRef customer,
        long amount,
        Payment? replacing)
    {
        var owed = (await CustomerAccounts.ReadAsync(db, customer.Id)).Balance + (replacing?.Amount ?? 0);

        if (amount <= owed)
        {
            return null;
        }

        if (owed <= 0)
        {
            return $"{customer.Name} está al día: no debe nada.";
        }

        return replacing is null
            ? $"{customer.Name} debe {Colones.Format(owed)}. El abono no puede ser mayor."
            : $"Sin este abono, {customer.Name} debería {Colones.Format(owed)}. El abono no puede ser mayor.";
    }

    /// <summary>For an abono paid as a credit sale was made, which follows that sale: see Payment.SaleId.</summary>
    public const string PaidWithSaleMessage =
        "Este abono se dio al hacer una venta fiada, así que se cambia o se borra desde esa venta.";

    public static string DeletedCustomerMessage(CustomerRef customer) =>
        $"Este abono es de {customer.Name}, un cliente que se borró, así que ya no se puede cambiar.";
}
