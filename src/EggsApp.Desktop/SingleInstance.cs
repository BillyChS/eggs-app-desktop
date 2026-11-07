using System.Runtime.InteropServices;
using System.Threading;

namespace EggsApp.Desktop;

/// <summary>
/// Makes sure only one copy of the app runs, so only one API ever writes to the SQLite file.
/// A second launch asks the running copy to bring its window forward, then exits.
/// </summary>
internal sealed class SingleInstance : IDisposable
{
    // "Local\" scopes these to the Windows session, like the per-user data they protect.
    // installer\EggsApp.iss uses the mutex name (AppMutex) to ask for the app to be closed: keep them the same.
    private const string MutexName = @"Local\EggsApp.Desktop.SingleInstance";
    private const string ActivateEventName = @"Local\EggsApp.Desktop.Activate";

    private const int AnyProcess = -1;

    private readonly Mutex _mutex;
    private readonly EventWaitHandle _activateEvent;
    private RegisteredWaitHandle? _activateWait;

    private SingleInstance(Mutex mutex, EventWaitHandle activateEvent)
    {
        _mutex = mutex;
        _activateEvent = activateEvent;
    }

    /// <summary>
    /// Returns the instance if this process is the first one, or null if another copy is already running.
    /// </summary>
    public static SingleInstance? TryAcquire()
    {
        var mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);

        if (!createdNew)
        {
            mutex.Dispose();
            return null;
        }

        return new SingleInstance(mutex, OpenActivateEvent());
    }

    public static void ActivateExisting()
    {
        // Windows only lets the foreground process hand over the foreground. Without this, the running copy
        // could only flash its taskbar button.
        AllowSetForegroundWindow(AnyProcess);

        using var activateEvent = OpenActivateEvent();
        activateEvent.Set();
    }

    /// <summary>
    /// A request made before this call is not lost: the event stays signaled until it is consumed.
    /// </summary>
    public void ListenForActivation(Action onActivate)
    {
        _activateWait = ThreadPool.RegisterWaitForSingleObject(
            _activateEvent,
            (_, _) => onActivate(),
            state: null,
            Timeout.Infinite,
            executeOnlyOnce: false);
    }

    public void Dispose()
    {
        _activateWait?.Unregister(null);
        _activateEvent.Dispose();
        _mutex.ReleaseMutex();
        _mutex.Dispose();
    }

    private static EventWaitHandle OpenActivateEvent() =>
        new(initialState: false, EventResetMode.AutoReset, ActivateEventName);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AllowSetForegroundWindow(int processId);
}
