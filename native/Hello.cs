using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
class Hello {
 [DllImport("combase.dll")] static extern int RoInitialize(uint mode);
 [DllImport("combase.dll", CharSet=CharSet.Unicode)] static extern int WindowsCreateString(string s,int length,out IntPtr value);
 [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr value);
 [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr name,ref Guid iid,out IntPtr factory);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int AsyncCall(IntPtr self,out IntPtr operation);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int IntCall(IntPtr self,out int result);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int VerifyCall(IntPtr self,IntPtr hwnd,IntPtr message,ref Guid iid,out IntPtr operation);
 static T Method<T>(IntPtr obj,int slot) { return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T)); }
 static void Check(int hr) { Marshal.ThrowExceptionForHR(hr); }
 static IntPtr String(string text) { IntPtr p; Check(WindowsCreateString(text,text.Length,out p)); return p; }
 static Guid OperationId() {
  byte[] ns = new byte[]{0x11,0xf4,0x7a,0xd5,0x7b,0x73,0x42,0xc0,0xab,0xae,0x87,0x8b,0x1e,0x16,0xad,0xee};
  byte[] signature=Encoding.UTF8.GetBytes("pinterface({9fc2b0bb-e446-44e2-aa61-9cab8f636af2};enum(Windows.Security.Credentials.UI.UserConsentVerificationResult;i4))");
  byte[] data=new byte[ns.Length+signature.Length]; ns.CopyTo(data,0); signature.CopyTo(data,ns.Length);
  byte[] hash=SHA1.Create().ComputeHash(data); hash[6]=(byte)((hash[6]&15)|80); hash[8]=(byte)((hash[8]&63)|128);
  string hex=BitConverter.ToString(hash,0,16).Replace("-",""); return Guid.ParseExact(hex,"N");
 }
 static int Await(IntPtr op) {
  IntPtr info; Guid iid=new Guid("00000036-0000-0000-c000-000000000046"); Check(Marshal.QueryInterface(op,ref iid,out info));
  try { int state=0; var start=DateTime.UtcNow; while(state==0) { Check(Method<IntCall>(info,7)(info,out state)); if((DateTime.UtcNow-start).TotalSeconds>110) throw new Exception("Windows Hello timed out."); if(state==0) Thread.Sleep(100); }
   if(state!=1) throw new Exception("Windows Hello was canceled or failed."); int result; Check(Method<IntCall>(op,8)(op,out result)); return result;
  } finally { Marshal.Release(info); Marshal.Release(op); }
 }
 [MTAThread] static void Main(string[] args) {
  var json=new JavaScriptSerializer();
  try { Check(RoInitialize(1)); IntPtr name=String("Windows.Security.Credentials.UI.UserConsentVerifier"), factory=IntPtr.Zero, op;
   try { bool verify=args.Length>0 && args[0]=="verify"; Guid iid=new Guid(verify?"39e050c3-4e74-441a-8dc0-b81104df949c":"af4f3f91-564c-4ddc-b8b5-973447627c65"); Check(RoGetActivationFactory(name,ref iid,out factory));
    if(verify) { IntPtr message=String("Unlock your Liquid Glass profile"); try { Guid operationId=OperationId(); Check(Method<VerifyCall>(factory,6)(factory,new IntPtr(long.Parse(args[1])),message,ref operationId,out op)); } finally { WindowsDeleteString(message); } }
    else Check(Method<AsyncCall>(factory,6)(factory,out op));
    int result=Await(op); var identity=WindowsIdentity.GetCurrent(); Console.WriteLine(json.Serialize(new {ok=true,result=result,sid=identity.User.Value,account=identity.Name}));
   } finally { WindowsDeleteString(name); if(factory!=IntPtr.Zero) Marshal.Release(factory); }
  } catch(Exception e) { Console.WriteLine(json.Serialize(new {ok=false,error=e.Message})); Environment.ExitCode=1; }
 }
}
