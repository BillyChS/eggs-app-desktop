namespace EggsApp.Api.Features.Common;

/// <summary>Why something was refused, in Spanish, to show as it is. The body of every 409.</summary>
public sealed record Refusal(string Message);

/// <summary>
/// What a handler that writes did: done, nothing with that id, refused fields (400), or refused as a whole (409).
/// </summary>
public sealed class Outcome<T>
{
    private Outcome(T? value, bool isNotFound, Dictionary<string, string[]>? errors, string? refusal)
    {
        Value = value;
        IsNotFound = isNotFound;
        Errors = errors;
        Refusal = refusal;
    }

    public T? Value { get; }

    public bool IsNotFound { get; }

    /// <summary>Spanish messages by field, ready to show next to each input.</summary>
    public Dictionary<string, string[]>? Errors { get; }

    /// <summary>A Spanish explanation of why the whole action was refused.</summary>
    public string? Refusal { get; }

    public static Outcome<T> Done(T value) => new(value, false, null, null);

    public static Outcome<T> NotFound() => new(default, true, null, null);

    public static Outcome<T> Invalid(string field, string message) => new(default, false, new() { [field] = [message] }, null);

    public static Outcome<T> Refused(string message) => new(default, false, null, message);

    public IResult ToResult(Func<T, IResult> done) =>
        Errors is not null ? Results.ValidationProblem(Errors)
        : Refusal is not null ? Results.Conflict(new Refusal(Refusal))
        : IsNotFound ? Results.NotFound()
        : done(Value!);
}
