using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Sales;

public static class SaleValidator
{
    /// <returns>
    /// Spanish messages by field, ready to show next to each input, with lines as "items[1].unitPrice". When there are
    /// none, the fields to save. Whether the customer exists is the handler's to check.
    /// </returns>
    public static (Dictionary<string, string[]> Errors, SaleFields? Fields) Validate(SaleCommand command)
    {
        var errors = new Dictionary<string, string[]>();
        var date = CalendarDays.Read(command.Date, "Escoja la fecha de la venta.", errors);
        var items = ReadItems(command.Items, errors);

        if (command.IsCredit && command.CustomerId is null)
        {
            errors["customerId"] = ["Escoja a quién se le fió."];
        }
        else if (!command.IsCredit && command.CustomerId is not null)
        {
            errors["customerId"] = ["Una venta al contado no lleva cliente."];
        }

        return (errors, errors.Count == 0 ? new SaleFields(date, items, command.CustomerId) : null);
    }

    private static List<SaleItemFields> ReadItems(
        IReadOnlyList<SaleItemCommand?>? items,
        Dictionary<string, string[]> errors)
    {
        var read = new List<SaleItemFields>();

        if (items is null || items.Count == 0)
        {
            errors["items"] = ["Agregue al menos un cartón."];
            return read;
        }

        if (items.Count > SaleItem.MaxPerSale)
        {
            errors["items"] = [$"Una venta no puede tener más de {SaleItem.MaxPerSale} líneas."];
            return read;
        }

        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var cartonType = ReadCartonType(item?.CartonType);

            if (cartonType is null)
            {
                errors[$"items[{index}].cartonType"] = ["Escoja el tipo de cartón."];
            }

            if (item?.Quantity is not { } quantity || quantity < 1)
            {
                errors[$"items[{index}].quantity"] = ["Escriba la cantidad de cartones."];
                quantity = 0;
            }
            else if (quantity > SaleItem.MaxQuantity)
            {
                errors[$"items[{index}].quantity"] = ["La cantidad no puede ser mayor que 10.000."];
            }

            if (item?.UnitPrice is not { } unitPrice || unitPrice < 1)
            {
                errors[$"items[{index}].unitPrice"] = ["Escriba el precio por cartón."];
                unitPrice = 0;
            }
            else if (unitPrice > SaleItem.MaxUnitPrice)
            {
                errors[$"items[{index}].unitPrice"] = ["El precio no puede ser mayor que ₡1.000.000."];
            }

            if (cartonType is { } type)
            {
                read.Add(new SaleItemFields(type, quantity, unitPrice));
            }
        }

        return read;
    }

    // Not Enum.Parse, which also accepts "0" and "a".
    private static CartonType? ReadCartonType(string? text) => text switch
    {
        "A" => CartonType.A,
        "B" => CartonType.B,
        _ => null,
    };
}
