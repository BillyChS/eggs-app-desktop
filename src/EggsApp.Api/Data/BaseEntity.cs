namespace EggsApp.Api.Data;

/// <summary>
/// Base of every entity. <see cref="AuditInterceptor"/> sets the timestamps and turns deletes into soft deletes.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; private init; } = Guid.NewGuid();

    public DateTime CreatedAt { get; internal set; }

    public DateTime UpdatedAt { get; internal set; }

    public bool IsDeleted { get; internal set; }
}
