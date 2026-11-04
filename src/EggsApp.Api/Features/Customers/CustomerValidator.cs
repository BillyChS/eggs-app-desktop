namespace EggsApp.Api.Features.Customers;

public static class CustomerValidator
{
    public static CustomerFields Clean(CustomerCommand command) => new(
        CustomerNames.Clean(command.Name ?? string.Empty),
        EmptyToNull(command.Phone),
        EmptyToNull(command.Notes));

    /// <returns>Spanish messages by field, ready to show next to each input. Empty if the fields are valid.</returns>
    public static Dictionary<string, string[]> Validate(CustomerFields fields)
    {
        var errors = new Dictionary<string, string[]>();

        if (fields.Name.Length == 0)
        {
            errors["name"] = ["Escriba el nombre del cliente."];
        }
        else if (fields.Name.Length > Customer.NameMaxLength)
        {
            errors["name"] = [$"El nombre no puede tener más de {Customer.NameMaxLength} letras."];
        }

        if (fields.Phone?.Length > Customer.PhoneMaxLength)
        {
            errors["phone"] = [$"El teléfono no puede tener más de {Customer.PhoneMaxLength} caracteres."];
        }

        if (fields.Notes?.Length > Customer.NotesMaxLength)
        {
            errors["notes"] = [$"Las notas no pueden tener más de {Customer.NotesMaxLength} letras."];
        }

        return errors;
    }

    private static string? EmptyToNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
