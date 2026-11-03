namespace EggsApp.Api.Hosting;

/// <summary>
/// Sends Error and Critical log entries to the <see cref="FailureLog"/>. This is how unhandled request
/// exceptions get there: Kestrel and the hosting layer log them at Error.
/// </summary>
public sealed class FailureLogLoggerProvider(FailureLog log) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new FailureLogLogger(log, categoryName);

    public void Dispose()
    {
    }

    private sealed class FailureLogLogger(FailureLog log, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel is LogLevel.Error or LogLevel.Critical;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
            {
                log.Write($"API {category}", formatter(state, exception), exception);
            }
        }
    }
}
