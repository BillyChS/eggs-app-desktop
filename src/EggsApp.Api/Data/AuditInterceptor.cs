using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace EggsApp.Api.Data;

/// <summary>
/// Sets the timestamps on save and turns deletes into soft deletes. ExecuteUpdate and ExecuteDelete skip this.
/// </summary>
internal sealed class AuditInterceptor(Func<DateTime>? now = null) : SaveChangesInterceptor
{
    private readonly Func<DateTime> _now = now ?? (() => DateTime.Now);

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Apply(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Apply(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void Apply(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var timestamp = _now();

        foreach (var entry in context.ChangeTracker.Entries<BaseEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = timestamp;
                    entry.Entity.UpdatedAt = timestamp;
                    break;

                case EntityState.Modified:
                    entry.Entity.UpdatedAt = timestamp;
                    entry.Property(entity => entity.CreatedAt).IsModified = false;
                    break;

                case EntityState.Deleted:
                    entry.State = EntityState.Modified;
                    entry.Entity.IsDeleted = true;
                    entry.Entity.UpdatedAt = timestamp;
                    entry.Property(entity => entity.CreatedAt).IsModified = false;
                    break;
            }
        }
    }
}
