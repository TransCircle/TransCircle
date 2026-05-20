import {
  createBrowserRouter,
  Outlet,
} from "react-router-dom";

import Navbar from "../components/Navbar";

import Home from "../pages/Home";

import Submit from "../pages/Submit";

import Admin from "../pages/Admin";

function Layout() {
  return (
    <>
      <Navbar />

      <Outlet />
    </>
  );
}

export const router =
  createBrowserRouter([
    {
      path: "/",

      element: <Layout />,

      children: [
        {
          index: true,

          element: <Home />,
        },

        {
          path: "submit",

          element: <Submit />,
        },

        {
          path: "admin",

          element: <Admin />,
        },
      ],
    },
  ]);