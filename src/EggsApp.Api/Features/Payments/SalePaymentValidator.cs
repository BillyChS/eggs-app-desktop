namespace EggsApp.Api.Features.Payments;

public static class SalePaymentValidator
{
    /// <returns>Spanish messages by field. When there are none, the amount to save.</returns>
    public static (Dictionary<string, string[]> Errors, long? Amount) Validate(SalePaymentCommand command)
    {
        var errors = new Dictionary<string, string[]>();

        if (command.Amount is not { } amount || amount < 1)
        {
            errors[PaymentRules.AmountField] = ["Escriba cuánto va a abonar."];
            return (errors, null);
        }

        return (errors, amount);
    }
}
