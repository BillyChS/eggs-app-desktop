using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Payments;

public static class PaymentValidator
{
    /// <returns>Spanish messages by field, ready to show next to each input. When there are none, the fields to save.</returns>
    public static (Dictionary<string, string[]> Errors, PaymentFields? Fields) Validate(PaymentCommand command)
    {
        var errors = new Dictionary<string, string[]>();
        var date = CalendarDays.Read(command.Date, "Escoja la fecha del abono.", errors);
        var note = string.IsNullOrWhiteSpace(command.Note) ? null : command.Note.Trim();

        if (command.Amount is not { } amount || amount < 1)
        {
            errors["amount"] = ["Escriba el monto del abono."];
            amount = 0;
        }

        if (note?.Length > Payment.NoteMaxLength)
        {
            errors["note"] = [$"La nota no puede tener más de {Payment.NoteMaxLength} letras."];
        }

        return (errors, errors.Count == 0 ? new PaymentFields(date, amount, note) : null);
    }
}
